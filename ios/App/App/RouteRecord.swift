import Foundation

/// One point of the Traveler's own route: one JSON line in `route.jsonl`.
struct RouteEntry: Codable, Equatable {
    let seq: Int
    let clientSampleId: String
    let tripId: String?
    let sampledAt: Double
    let lat: Double
    let lon: Double
}

/// The web view's optional `route` request on `getLocalTrailSnapshot`.
struct RouteRequest: Equatable {
    let tripId: String?
    let sinceSeq: Int?
    let generation: String?
}

/// The entries of one trip the map does not hold yet, plus the counts the map logs.
struct RouteDelta {
    let tripId: String?
    /// New on load and on every removal except age and cap pruning.
    let generation: String
    /// `points` is the trip's whole record: the generation differs or `sinceSeq` was nil.
    let replace: Bool
    /// The oldest seq still recorded (any trip): held points below it were pruned.
    let firstSeq: Int
    /// The newest seq handed out; the map sends it back as `sinceSeq`.
    let lastSeq: Int
    let points: [RouteEntry]
    /// Entries of this trip, of every trip, and the file's size.
    let recordSize: Int
    let totalSize: Int
    let bytesOnDisk: Int
    /// Entries removed for any reason since the previous read.
    let prunedSinceLastRead: Int
}

/// The phone's durable record of the route it captured, so the Traveler's own map can draw the whole day
/// with no Convex reads, offline, unsent points included. An append-only JSON-lines file, rewritten from
/// memory after a removal or once it holds `compactionThreshold` dead lines.
///
/// Not thread-safe: the publisher calls it only on its serial work queue. Loaded lazily at first use.
/// After a failed write memory stays the truth (`writeFailures` counts it) and the next write rewrites the
/// whole file. Only a failed load throws, and it changes nothing.
final class RouteRecord {
    /// Why 5,000: the busiest measured day had 2,300 points (owner's trail data, 2026-11-15), so this is
    /// 2.2 times that. A line is about 195 bytes, so the file stays near 1 MB. The record exists so the
    /// Traveler's whole-day route costs no Convex reads; Followers keep about 100 points from the server.
    static let maxEntries = 5_000
    /// Why 26 hours: the longest local day is 25 hours (a DST change), so the web's day window always fits
    /// and native needs no time zone. Older points are Replay's job.
    static let maxAge: TimeInterval = 26 * 3_600
    /// Dead lines (pruned or unreadable) the file may hold before it is rewritten from memory.
    static let compactionThreshold = 1_000

    enum TripMatch: Equatable {
        case any
        case trip(String?)
    }

    enum Removal: Equatable {
        case all
        case trip(String?)
        case range(TripMatch, startMs: Double, endExclusiveMs: Double)
        case sampledAt(TripMatch, Set<Double>)
        case clientSampleIds(Set<String>)
    }

    let fileURL: URL
    /// Age and cap pruning: reason ("age" or "cap"), removed, remaining. Called synchronously.
    var onPrune: ((String, Int, Int) -> Void)?

    private(set) var generation = UUID().uuidString.lowercased()
    private(set) var bytesOnDisk = 0
    private(set) var writeFailures = 0
    private(set) var prunedSinceLastRead = 0

    private let now: () -> Date
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var entries: [RouteEntry] = []
    private var loaded = false
    private var nextSeq = 1
    private var deadLines = 0
    private var needsRewrite = false

    init(fileURL: URL, now: @escaping () -> Date = Date.init, fileManager: FileManager = .default) {
        self.fileURL = fileURL
        self.now = now
        self.fileManager = fileManager
    }

    /// Entries in memory, every trip (0 before the first load).
    var count: Int { entries.count }

    func count(tripId: String?) -> Int {
        entries.reduce(0) { $1.tripId == tripId ? $0 + 1 : $0 }
    }

    /// Reads the file once. Unreadable lines (a torn write) are skipped and the file is then rewritten.
    func load() throws {
        guard !loaded else { return }
        var data = Data()
        if fileManager.fileExists(atPath: fileURL.path) {
            do {
                data = try Data(contentsOf: fileURL)
            } catch {
                writeFailures += 1
                throw error
            }
        }
        var parsed: [RouteEntry] = []
        var unreadable = 0
        var maxSeq = 0
        for line in data.split(separator: 0x0A, omittingEmptySubsequences: true) {
            if let entry = try? decoder.decode(RouteEntry.self, from: Data(line)) {
                parsed.append(entry)
                maxSeq = max(maxSeq, entry.seq)
            } else {
                unreadable += 1
            }
        }
        entries = parsed
        nextSeq = maxSeq + 1
        bytesOnDisk = data.count
        deadLines = unreadable
        // A line without its newline would swallow the next append.
        needsRewrite = unreadable > 0 || (data.last.map { $0 != 0x0A } ?? false)
        generation = UUID().uuidString.lowercased()
        loaded = true
        pruneEntries(now: now())
        if needsRewrite || deadLines >= Self.compactionThreshold { rewrite() }
    }

    /// Records one queued sample. Only the recorded trail enters: `recordTrail` is false for a parked
    /// marker and for a fix taken with Live Trail off, and those return nil without touching the file.
    @discardableResult
    func append(
        clientSampleId: String,
        tripId: String?,
        sampledAt: Double,
        lat: Double,
        lon: Double,
        recordTrail: Bool
    ) throws -> RouteEntry? {
        guard recordTrail else { return nil }
        try load()
        let entry = RouteEntry(
            seq: nextSeq,
            clientSampleId: clientSampleId,
            tripId: tripId,
            sampledAt: sampledAt,
            lat: lat,
            lon: lon
        )
        nextSeq += 1
        entries.append(entry)
        pruneEntries(now: now())
        if needsRewrite || deadLines >= Self.compactionThreshold {
            rewrite()
        } else if entries.last == entry {
            appendLine(entry)
        }
        return entry
    }

    func delta(tripId: String?, sinceSeq: Int?, generation requested: String?) throws -> RouteDelta {
        try load()
        prune(now: now())
        let replace = sinceSeq == nil || requested != generation
        let points = entries.filter { entry in
            entry.tripId == tripId && (replace || entry.seq > (sinceSeq ?? 0))
        }
        let pruned = prunedSinceLastRead
        prunedSinceLastRead = 0
        return RouteDelta(
            tripId: tripId,
            generation: generation,
            replace: replace,
            firstSeq: entries.first?.seq ?? nextSeq,
            lastSeq: nextSeq - 1,
            points: points,
            recordSize: count(tripId: tripId),
            totalSize: entries.count,
            bytesOnDisk: bytesOnDisk,
            prunedSinceLastRead: pruned
        )
    }

    /// Removes the matching entries, bumps the generation and rewrites the file at once. When the record
    /// cannot be read, the file is deleted instead, so removed points never stay on the phone.
    @discardableResult
    func remove(_ removal: Removal) -> Int {
        do {
            try load()
        } catch {
            entries.removeAll()
            deadLines = 0
            // If the delete fails too, the next write must replace the file, not append to it.
            needsRewrite = true
            loaded = true
            generation = UUID().uuidString.lowercased()
            deleteFile()
            return 0
        }
        let before = entries.count
        entries.removeAll { Self.matches(removal, $0) }
        let removed = before - entries.count
        guard removed > 0 || removal == .all else { return 0 }
        generation = UUID().uuidString.lowercased()
        prunedSinceLastRead += removed
        rewrite()
        if needsRewrite { deleteFile() }
        return removed
    }

    /// Drops entries older than `maxAge`, then the oldest beyond `maxEntries`. The generation is kept:
    /// `firstSeq` tells the map. Returns how many were removed.
    @discardableResult
    func prune(now date: Date) -> Int {
        guard loaded else { return 0 }
        let removed = pruneEntries(now: date)
        if removed > 0, deadLines >= Self.compactionThreshold { rewrite() }
        return removed
    }

    @discardableResult
    private func pruneEntries(now date: Date) -> Int {
        let cutoffMs = (date.timeIntervalSince1970 - Self.maxAge) * 1_000
        let aged = entries.prefix(while: { $0.sampledAt < cutoffMs }).count
        if aged > 0 { entries.removeFirst(aged) }
        let capped = max(0, entries.count - Self.maxEntries)
        if capped > 0 { entries.removeFirst(capped) }
        let removed = aged + capped
        guard removed > 0 else { return 0 }
        deadLines += removed
        prunedSinceLastRead += removed
        if aged > 0 { onPrune?("age", aged, entries.count) }
        if capped > 0 { onPrune?("cap", capped, entries.count) }
        return removed
    }

    private static func matches(_ removal: Removal, _ entry: RouteEntry) -> Bool {
        switch removal {
        case .all:
            return true
        case .trip(let tripId):
            return entry.tripId == tripId
        case let .range(trip, startMs, endExclusiveMs):
            return matches(trip, entry) && entry.sampledAt >= startMs && entry.sampledAt < endExclusiveMs
        case let .sampledAt(trip, times):
            return matches(trip, entry) && times.contains(entry.sampledAt)
        case .clientSampleIds(let ids):
            return ids.contains(entry.clientSampleId)
        }
    }

    private static func matches(_ trip: TripMatch, _ entry: RouteEntry) -> Bool {
        switch trip {
        case .any: return true
        case .trip(let tripId): return entry.tripId == tripId
        }
    }

    // MARK: - File

    private func line(_ entry: RouteEntry) throws -> Data {
        var data = try encoder.encode(entry)
        data.append(0x0A)
        return data
    }

    private func appendLine(_ entry: RouteEntry) {
        do {
            let data = try line(entry)
            if fileManager.fileExists(atPath: fileURL.path) {
                let handle = try FileHandle(forWritingTo: fileURL)
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
            } else {
                guard fileManager.createFile(
                    atPath: fileURL.path,
                    contents: data,
                    attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
                ) else { throw CocoaError(.fileWriteUnknown) }
                try excludeFromBackup()
            }
            bytesOnDisk += data.count
        } catch {
            writeFailures += 1
            needsRewrite = true
        }
    }

    /// Writes memory to the file (or deletes it when empty). On failure the next write tries again.
    private func rewrite() {
        do {
            if entries.isEmpty {
                if fileManager.fileExists(atPath: fileURL.path) { try fileManager.removeItem(at: fileURL) }
                bytesOnDisk = 0
            } else {
                var data = Data()
                for entry in entries { data.append(try line(entry)) }
                try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                // An atomic write replaces the file, which drops the exclusion: set it every time.
                try excludeFromBackup()
                bytesOnDisk = data.count
            }
            deadLines = 0
            needsRewrite = false
        } catch {
            writeFailures += 1
            needsRewrite = true
        }
    }

    private func deleteFile() {
        do {
            if fileManager.fileExists(atPath: fileURL.path) { try fileManager.removeItem(at: fileURL) }
            bytesOnDisk = 0
            deadLines = 0
        } catch {
            writeFailures += 1
        }
    }

    /// Kept out of iPhone and iCloud backups: a restore must not bring back a day of precise route.
    private func excludeFromBackup() throws {
        var url = fileURL
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
}
