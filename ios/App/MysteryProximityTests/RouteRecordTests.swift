import XCTest

final class RouteRecordTests: XCTestCase {
    private let base = Date(timeIntervalSince1970: 1_800_000_000)
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var directory: URL!
    private var fileURL: URL { directory.appendingPathComponent("route.jsonl") }

    override func setUpWithError() throws {
        clock = base
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("RouteRecordTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makeRecord() -> RouteRecord {
        RouteRecord(fileURL: fileURL, now: { [unowned self] in self.clock })
    }

    private var baseMs: Double { base.timeIntervalSince1970 * 1_000 }

    @discardableResult
    private func append(
        _ record: RouteRecord,
        _ id: String,
        trip: String? = "t1",
        atMs: Double? = nil,
        recordTrail: Bool = true
    ) throws -> RouteEntry? {
        try record.append(
            clientSampleId: id,
            tripId: trip,
            sampledAt: atMs ?? clock.timeIntervalSince1970 * 1_000,
            lat: 47.61,
            lon: -122.33,
            recordTrail: recordTrail
        )
    }

    private func ids(_ delta: RouteDelta) -> [String] { delta.points.map(\.clientSampleId) }

    /// A fresh URL each time, so no cached resource value hides an atomic write that dropped the flag.
    private func isExcludedFromBackup() throws -> Bool? {
        try URL(fileURLWithPath: fileURL.path).resourceValues(forKeys: [.isExcludedFromBackupKey])
            .isExcludedFromBackup
    }

    private func fileLines() throws -> [Data] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        return try Data(contentsOf: fileURL).split(separator: 0x0A).map { Data($0) }
    }

    // MARK: - Append and load

    func testAppendAndLoadRoundTrip() throws {
        let record = makeRecord()
        try append(record, "a", trip: "t1", atMs: baseMs)
        try append(record, "b", trip: nil, atMs: baseMs + 1)
        try append(record, "c", trip: "t1", atMs: baseMs + 2.5)
        let written = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil).points

        let reloaded = makeRecord()
        let delta = try reloaded.delta(tripId: "t1", sinceSeq: nil, generation: nil)
        XCTAssertEqual(delta.points, written)
        XCTAssertEqual(delta.points.map(\.seq), [1, 3])
        XCTAssertEqual(delta.points.last?.sampledAt, baseMs + 2.5)
        XCTAssertEqual(try reloaded.delta(tripId: nil, sinceSeq: nil, generation: nil).points.map(\.clientSampleId), ["b"])
        XCTAssertEqual(delta.totalSize, 3)
        XCTAssertEqual(delta.recordSize, 2)
        XCTAssertEqual(delta.bytesOnDisk, try Data(contentsOf: fileURL).count)
        XCTAssertNotEqual(delta.generation, record.generation, "a new load is a new generation")
        XCTAssertEqual(try append(reloaded, "d")?.seq, 4, "seq continues after a reload")
        let values = try fileURL.resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(values.isExcludedFromBackup, true)
    }

    func testParkedOrLiveTrailOffSampleIsNeverRecorded() throws {
        let record = makeRecord()
        XCTAssertNil(try append(record, "parked", recordTrail: false))
        XCTAssertEqual(record.count, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path))
        try append(record, "kept")
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["kept"])
    }

    func testTornLastLineIsSkippedAndTheNextAppendStartsCleanly() throws {
        let first = makeRecord()
        try append(first, "a")
        try append(first, "b")
        let handle = try FileHandle(forWritingTo: fileURL)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(#"{"seq":3,"clientSampleId":"tor"#.utf8))
        try handle.close()

        let record = makeRecord()
        XCTAssertEqual(ids(try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["a", "b"])
        try append(record, "c")
        XCTAssertEqual(try fileLines().count, 3, "the torn line was dropped by a rewrite")
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["a", "b", "c"])
    }

    // MARK: - Pruning

    func testPruneByAgeKeepsGenerationAndMovesFirstSeq() throws {
        var pruned: [(String, Int, Int)] = []
        let record = makeRecord()
        record.onPrune = { pruned.append(($0, $1, $2)) }
        try append(record, "old", atMs: baseMs)
        try append(record, "new", atMs: baseMs + 60_000)
        let before = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)

        clock = base.addingTimeInterval(RouteRecord.maxAge + 30)
        XCTAssertEqual(record.prune(now: clock), 1)
        let after = try record.delta(tripId: "t1", sinceSeq: before.lastSeq, generation: before.generation)
        XCTAssertEqual(after.generation, before.generation)
        XCTAssertFalse(after.replace)
        XCTAssertEqual(after.firstSeq, 2)
        XCTAssertEqual(after.prunedSinceLastRead, 1)
        XCTAssertEqual(after.totalSize, 1)
        XCTAssertEqual(pruned.map(\.0), ["age"])
        XCTAssertEqual(pruned.first?.1, 1)
        XCTAssertEqual(pruned.first?.2, 1)
        XCTAssertEqual(try record.delta(tripId: "t1", sinceSeq: after.lastSeq, generation: after.generation)
            .prunedSinceLastRead, 0, "the count resets on read")
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["new"],
                       "a reload prunes too")
    }

    func testPruneByCapDropsTheOldest() throws {
        var capped = 0
        let record = makeRecord()
        record.onPrune = { reason, removed, _ in if reason == "cap" { capped += removed } }
        for index in 0..<(RouteRecord.maxEntries + 3) {
            try append(record, "s\(index)", atMs: baseMs + Double(index))
        }
        let delta = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)
        XCTAssertEqual(delta.totalSize, RouteRecord.maxEntries)
        XCTAssertEqual(delta.firstSeq, 4)
        XCTAssertEqual(delta.points.first?.clientSampleId, "s3")
        XCTAssertEqual(capped, 3)
        XCTAssertEqual(makeRecord().count, 0, "not loaded until first use")
        XCTAssertEqual(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil).totalSize,
                       RouteRecord.maxEntries)
    }

    func testCompactionAtOneThousandDeadLines() throws {
        let belowThreshold = makeRecord()
        for index in 0..<(RouteRecord.compactionThreshold - 1) {
            try append(belowThreshold, "o\(index)", atMs: baseMs)
        }
        clock = base.addingTimeInterval(RouteRecord.maxAge + 60)
        try append(belowThreshold, "fresh")
        XCTAssertEqual(belowThreshold.count, 1)
        XCTAssertEqual(try fileLines().count, RouteRecord.compactionThreshold, "999 dead lines stay")

        try FileManager.default.removeItem(at: fileURL)
        clock = base
        let atThreshold = makeRecord()
        for index in 0..<RouteRecord.compactionThreshold {
            try append(atThreshold, "o\(index)", atMs: baseMs)
        }
        clock = base.addingTimeInterval(RouteRecord.maxAge + 60)
        try append(atThreshold, "fresh")
        XCTAssertEqual(try fileLines().count, 1, "1,000 dead lines rewrite the file")
        XCTAssertEqual(try isExcludedFromBackup(), true, "a compaction rewrite keeps the file out of backups")
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["fresh"])
    }

    // MARK: - Delta

    func testDeltaPerTripAndSinceSeq() throws {
        let record = makeRecord()
        try append(record, "a1", trip: "t1")
        try append(record, "b1", trip: "t2")
        try append(record, "n1", trip: nil)
        let first = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)
        XCTAssertTrue(first.replace)
        XCTAssertEqual(ids(first), ["a1"])
        XCTAssertEqual(first.tripId, "t1")
        XCTAssertEqual(first.lastSeq, 3)
        XCTAssertEqual(first.firstSeq, 1)

        try append(record, "a2", trip: "t1")
        try append(record, "b2", trip: "t2")
        let next = try record.delta(tripId: "t1", sinceSeq: first.lastSeq, generation: first.generation)
        XCTAssertFalse(next.replace)
        XCTAssertEqual(ids(next), ["a2"])
        XCTAssertEqual(next.lastSeq, 5)
        XCTAssertEqual(next.recordSize, 2)
        XCTAssertEqual(next.totalSize, 5)

        let none = try record.delta(tripId: "t1", sinceSeq: next.lastSeq, generation: next.generation)
        XCTAssertFalse(none.replace)
        XCTAssertEqual(none.points, [])
        XCTAssertEqual(ids(try record.delta(tripId: nil, sinceSeq: nil, generation: nil)), ["n1"],
                       "untagged entries match a null trip only")
        XCTAssertEqual(ids(try record.delta(tripId: "t3", sinceSeq: nil, generation: nil)), [])
    }

    func testReplaceWhenGenerationDiffersOrSinceSeqIsNil() throws {
        let record = makeRecord()
        try append(record, "a")
        try append(record, "b")
        let current = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)

        let stale = try record.delta(tripId: "t1", sinceSeq: current.lastSeq, generation: "old-process")
        XCTAssertTrue(stale.replace)
        XCTAssertEqual(ids(stale), ["a", "b"])

        let noSeq = try record.delta(tripId: "t1", sinceSeq: nil, generation: current.generation)
        XCTAssertTrue(noSeq.replace)
        XCTAssertEqual(ids(noSeq), ["a", "b"])

        let empty = makeRecord()
        try FileManager.default.removeItem(at: fileURL)
        let emptyDelta = try empty.delta(tripId: "t1", sinceSeq: nil, generation: nil)
        XCTAssertEqual(emptyDelta.points, [])
        XCTAssertEqual(emptyDelta.lastSeq, 0)
        XCTAssertEqual(emptyDelta.firstSeq, 1)
    }

    // MARK: - Removal

    func testEachRemovalScopeRemovesTheRightEntriesAndBumpsTheGeneration() throws {
        let record = makeRecord()
        try append(record, "a", trip: "t1", atMs: baseMs)
        try append(record, "b", trip: "t1", atMs: baseMs + 1_000)
        try append(record, "c", trip: "t1", atMs: baseMs + 2_000)
        try append(record, "d", trip: "t2", atMs: baseMs + 1_000)
        try append(record, "e", trip: nil, atMs: baseMs + 3_000)
        try append(record, "f", trip: "t2", atMs: baseMs + 4_000)
        try append(record, "g", trip: "t3", atMs: baseMs + 5_000)

        func check(
            _ removal: RouteRecord.Removal,
            removes expected: Int,
            leaving remaining: [String],
            line: UInt = #line
        ) throws {
            let generation = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil).generation
            XCTAssertEqual(record.remove(removal), expected, line: line)
            XCTAssertNotEqual(record.generation, generation, "a removal bumps the generation", line: line)
            let all = ["t1", "t2", "t3", nil].flatMap { trip in
                (try? record.delta(tripId: trip, sinceSeq: nil, generation: nil).points) ?? []
            }.sorted { $0.seq < $1.seq }
            XCTAssertEqual(all.map(\.clientSampleId), remaining, line: line)
            let reloaded = makeRecord()
            let onDisk = ["t1", "t2", "t3", nil].flatMap { trip in
                (try? reloaded.delta(tripId: trip, sinceSeq: nil, generation: nil).points) ?? []
            }.sorted { $0.seq < $1.seq }
            XCTAssertEqual(onDisk.map(\.clientSampleId), remaining, "the file is rewritten at once", line: line)
        }

        try check(.clientSampleIds(["c", "zzz"]), removes: 1, leaving: ["a", "b", "d", "e", "f", "g"])
        XCTAssertEqual(try isExcludedFromBackup(), true, "a removal rewrite keeps the file out of backups")
        try check(.range(.trip("t1"), startMs: baseMs + 1_000, endExclusiveMs: baseMs + 3_000),
                  removes: 1, leaving: ["a", "d", "e", "f", "g"])
        try check(.sampledAt(.any, [baseMs, baseMs + 1_000]), removes: 2, leaving: ["e", "f", "g"])
        try check(.trip("t2"), removes: 1, leaving: ["e", "g"])
        try check(.trip(nil), removes: 1, leaving: ["g"])
        try check(.all, removes: 1, leaving: [])
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path), "a wipe deletes the file")

        try append(record, "h")
        let generation = record.generation
        XCTAssertEqual(record.remove(.trip("other")), 0)
        XCTAssertEqual(record.generation, generation, "a removal that matches nothing keeps the generation")
    }

    func testSampledAtMatchesWithinHalfAMillisecond() throws {
        clock = Date(timeIntervalSince1970: 1_794_792_100)
        let record = makeRecord()
        try append(record, "a", atMs: 1_794_792_091_500.201)
        XCTAssertEqual(record.remove(.sampledAt(.any, [])), 0, "an empty list removes nothing")
        XCTAssertEqual(record.remove(.sampledAt(.any, [1_794_792_091_501.3])), 0)
        XCTAssertEqual(record.count, 1)
        XCTAssertEqual(record.remove(.sampledAt(.trip("t1"), [1_794_792_091_500.2012])), 1)
        XCTAssertEqual(record.count, 0)
    }

    // MARK: - Failures

    func testWriteFailureIsReportedAndMemoryStaysConsistent() throws {
        let record = makeRecord()
        try append(record, "a")
        // The directory becomes a plain file: every write now fails.
        try FileManager.default.removeItem(at: directory)
        XCTAssertTrue(FileManager.default.createFile(atPath: directory.path, contents: Data()))

        XCTAssertNoThrow(try append(record, "b"), "a write failure never reaches the caller")
        XCTAssertEqual(record.writeFailures, 1)
        let delta = try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)
        XCTAssertEqual(ids(delta), ["a", "b"], "memory keeps the point")
        XCTAssertEqual(delta.points.map(\.seq), [1, 2])

        try FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try append(record, "c")
        XCTAssertEqual(record.writeFailures, 1)
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["a", "b", "c"],
                       "the next write rewrites the whole file from memory")
    }

    func testFailingRewriteIsRetriedAtMostOnceAMinute() throws {
        let record = makeRecord()
        try append(record, "a")
        try FileManager.default.removeItem(at: directory)
        XCTAssertTrue(FileManager.default.createFile(atPath: directory.path, contents: Data()))
        try append(record, "b") // the append fails
        try append(record, "c") // the rewrite fails: retries now wait a minute
        XCTAssertEqual(record.writeFailures, 2)

        try FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        clock = clock.addingTimeInterval(RouteRecord.rewriteRetryInterval - 1)
        try append(record, "d")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path), "no rewrite within the minute")
        XCTAssertEqual(record.writeFailures, 3, "a skipped write still counts")
        XCTAssertEqual(ids(try record.delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["a", "b", "c", "d"])

        clock = clock.addingTimeInterval(2)
        try append(record, "e")
        XCTAssertEqual(record.writeFailures, 3)
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)),
                       ["a", "b", "c", "d", "e"], "the retry after a minute writes memory")
    }

    func testUnreadableRecordThrowsOnReadAndARemovalDeletesIt() throws {
        // A directory where the file should be: it exists but cannot be read.
        try FileManager.default.createDirectory(at: fileURL, withIntermediateDirectories: true)
        let record = makeRecord()
        XCTAssertThrowsError(try append(record, "a"))
        XCTAssertThrowsError(try record.delta(tripId: "t1", sinceSeq: nil, generation: nil))
        XCTAssertEqual(record.writeFailures, 2)
        XCTAssertEqual(record.count, 0)

        XCTAssertEqual(record.remove(.trip("t1")), 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path), "removed points never stay")
        try append(record, "b")
        XCTAssertEqual(ids(try makeRecord().delta(tripId: "t1", sinceSeq: nil, generation: nil)), ["b"])
    }
}
