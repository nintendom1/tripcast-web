import CoreLocation
import Capacitor
import Foundation
import Security
import UIKit

final class NativeLocationPublisher {
    static let shared = NativeLocationPublisher()

    struct CloakZone: Codable {
        let lat: Double
        let lon: Double
        let radiusMeters: Double
    }

    struct Configuration: Codable {
        let endpoint: String
        let liveTrailEnabled: Bool
        let alertThresholdSeconds: TimeInterval
        let cloakTimeoutSeconds: TimeInterval
        let cloakZones: [CloakZone]
    }

    struct PendingSample: Codable {
        let clientSampleId: String
        let lat: Double
        let lon: Double
        let accuracy: Double?
        let sampledAt: Double
        let recordTrail: Bool
        let reason: String
    }

    private enum KeychainKey {
        static let service = "com.tripcast.app.native-location"
        static let account = "traveler-token"
    }

    private let workQueue = DispatchQueue(label: "com.tripcast.native-location-publisher")
    private let fileManager = FileManager.default
    private let maxQueueDepth = 10_000
    private let minEmissionInterval: TimeInterval = 3
    private let heartbeatInterval: TimeInterval = 60
    private let minDistanceMeters: CLLocationDistance = 10
    private let minBearingDistanceMeters: CLLocationDistance = 3
    private let turnThresholdDegrees = 18.0

    private var configuration: Configuration?
    private var samples: [PendingSample] = []
    private var isPublishing = false
    private var generation = 0
    private var retryWorkItem: DispatchWorkItem?
    private var lastEmissionLocation: CLLocation?
    private var lastEmissionAt: Date?
    private var lastBearing: CLLocationDirection?
    private var enteredCloakAt: Date?
    private var currentMode = "off"

    var eventHandler: ((JSObject) -> Void)?
    var onCloakTimeout: (() -> Void)?

    private init() {
        configuration = loadConfiguration()
        samples = loadSamples()
    }

    func configure(
        endpoint: String,
        token: String,
        liveTrailEnabled: Bool,
        alertThresholdSeconds: TimeInterval,
        cloakTimeoutSeconds: TimeInterval,
        cloakZones: [CloakZone]
    ) throws {
        try workQueue.sync {
            guard let url = URL(string: endpoint), isAllowedEndpoint(url) else {
                throw NSError(
                    domain: "TripCastNativeLocation",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "The native location endpoint is not allowed."]
                )
            }
            try storeToken(token)
            let next = Configuration(
                endpoint: endpoint,
                liveTrailEnabled: liveTrailEnabled,
                alertThresholdSeconds: max(0, alertThresholdSeconds),
                cloakTimeoutSeconds: max(0, cloakTimeoutSeconds),
                cloakZones: cloakZones
            )
            generation += 1
            isPublishing = false
            retryWorkItem?.cancel()
            retryWorkItem = nil
            configuration = next
            try persist(next, to: configurationURL)
            LiveActivityController.shared.configure(alertThresholdSeconds: next.alertThresholdSeconds)
            publishIfPossibleLocked()
        }
    }

    func startLive(mode: String) {
        workQueue.async { [weak self] in
            guard let self else { return }
            self.currentMode = mode
            LiveActivityController.shared.start(mode: mode, queueDepth: self.samples.count)
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
            self.publishIfPossibleLocked()
        }
    }

    func setMode(_ mode: String) {
        workQueue.async { [weak self] in
            guard let self else { return }
            self.currentMode = mode
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
        }
    }

    func stopLive(clearCredentials: Bool) {
        workQueue.sync {
            generation += 1
            isPublishing = false
            retryWorkItem?.cancel()
            retryWorkItem = nil
            currentMode = "off"
            lastEmissionLocation = nil
            lastEmissionAt = nil
            lastBearing = nil
            enteredCloakAt = nil
            samples.removeAll()
            try? fileManager.removeItem(at: samplesURL)
            LiveActivityController.shared.stop()
            if clearCredentials {
                configuration = nil
                try? fileManager.removeItem(at: configurationURL)
                deleteToken()
            }
            emit("gps:native-publish:stopped", details: ["queueDepth": 0])
        }
    }

    func accept(_ location: CLLocation, forcedReason: String? = nil) {
        workQueue.async { [weak self] in
            guard let self, self.configuration != nil else { return }
            if self.shouldSuppress(location) {
                LiveActivityController.shared.setPrivacyPaused(lastAcknowledgedAt: nil)
                return
            }

            if self.enteredCloakAt != nil {
                self.enteredCloakAt = nil
                LiveActivityController.shared.setMode(self.currentMode, queueDepth: self.samples.count)
            }

            let now = location.timestamp
            let elapsed = self.lastEmissionAt.map { now.timeIntervalSince($0) } ?? .infinity
            let distance = self.lastEmissionLocation.map { location.distance(from: $0) } ?? .infinity
            let bearing = self.lastEmissionLocation.map { self.bearing(from: $0, to: location) }
            let bearingDelta = bearing.flatMap { current in
                self.lastBearing.map { self.smallestBearingDelta($0, current) }
            } ?? 0

            var reason = forcedReason
            if reason == nil && self.lastEmissionLocation == nil {
                reason = "force"
            } else if reason == nil && elapsed >= self.heartbeatInterval {
                reason = "heartbeat"
            } else if reason == nil && elapsed >= self.minEmissionInterval &&
                        distance >= self.minBearingDistanceMeters && bearingDelta >= self.turnThresholdDegrees {
                reason = "turn"
            } else if reason == nil && elapsed >= self.minEmissionInterval && distance >= self.minDistanceMeters {
                reason = "distance"
            }
            guard let reason else { return }

            let acceptedReason = Self.acceptedReason(reason)
            let sample = PendingSample(
                clientSampleId: UUID().uuidString.lowercased(),
                lat: location.coordinate.latitude,
                lon: location.coordinate.longitude,
                accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil,
                sampledAt: location.timestamp.timeIntervalSince1970 * 1_000,
                recordTrail: self.configuration?.liveTrailEnabled == true,
                reason: acceptedReason
            )
            self.samples.append(sample)
            if self.samples.count > self.maxQueueDepth {
                self.samples.removeFirst(self.samples.count - self.maxQueueDepth)
                self.emit("gps:native-publish:queue-capacity", level: "warn", details: [
                    "queueDepth": self.samples.count
                ])
            }
            self.lastEmissionLocation = location
            self.lastEmissionAt = now
            self.lastBearing = bearing
            self.persistSamples()
            self.emit("gps:native-publish:queued", details: [
                "queueDepth": self.samples.count,
                "reason": acceptedReason,
                "recordTrail": sample.recordTrail
            ])
            LiveActivityController.shared.setQueueDepth(self.samples.count)
            self.publishIfPossibleLocked()
        }
    }

    func publishIfPossible() {
        workQueue.async { [weak self] in self?.publishIfPossibleLocked() }
    }

    func stopRemoteSharing() {
        workQueue.async { [weak self] in
            guard let self,
                  let config = self.configuration,
                  let token = self.readToken(),
                  let baseURL = URL(string: config.endpoint) else { return }
            var request = URLRequest(url: baseURL.appendingPathComponent("api/mutation"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.timeoutInterval = 15
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "path": "routeVotes:stopTravelerLocationSharing",
                "args": ["token": token],
                "format": "json"
            ])
            let backgroundTask = self.beginBackgroundTask()
            URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
                guard let self else { return }
                let status = (response as? HTTPURLResponse)?.statusCode
                let succeeded = error == nil && status.map { (200..<300).contains($0) } == true
                var details: JSObject = ["result": succeeded ? "ack" : "failure"]
                if !succeeded {
                    details["failureClass"] = error == nil ? "server" : "network"
                }
                self.emit(
                    succeeded
                        ? "gps:native-publish:privacy-stop:ack"
                        : "gps:native-publish:privacy-stop:failure",
                    level: succeeded ? "info" : "warn",
                    details: details
                )
                self.endBackgroundTask(backgroundTask)
            }.resume()
        }
    }

    private func publishIfPossibleLocked() {
        guard !isPublishing, !samples.isEmpty,
              let config = configuration,
              let token = readToken(),
              let baseURL = URL(string: config.endpoint) else { return }
        isPublishing = true
        let requestGeneration = generation
        retryWorkItem?.cancel()
        retryWorkItem = nil
        let batch = Array(samples.prefix(20))
        let endpoint = baseURL.appendingPathComponent("api/mutation")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encodedSamples: [[String: Any]] = batch.map { sample in
            var value: [String: Any] = [
                "clientSampleId": sample.clientSampleId,
                "lat": sample.lat,
                "lon": sample.lon,
                "sampledAt": sample.sampledAt,
                "recordTrail": sample.recordTrail,
                "reason": sample.reason
            ]
            if let accuracy = sample.accuracy { value["accuracy"] = accuracy }
            return value
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "path": "nativeLocationIngest:travelerIngestNativeLocationBatch",
            "args": ["token": token, "samples": encodedSamples],
            "format": "json"
        ])

        let backgroundTask = beginBackgroundTask()
        emit("gps:native-publish:attempt", details: [
            "batchSize": batch.count,
            "queueDepth": samples.count
        ])
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.workQueue.async {
                guard let self else { return }
                guard requestGeneration == self.generation else {
                    self.endBackgroundTask(backgroundTask)
                    return
                }
                guard error == nil,
                      let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode),
                      let data,
                      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      root["status"] as? String == "success",
                      let value = root["value"] as? [String: Any] else {
                    self.emit("gps:native-publish:failure", level: "warn", details: [
                        "queueDepth": self.samples.count,
                        "failureClass": error == nil ? "server" : "network"
                    ])
                    LiveActivityController.shared.setRecovering(queueDepth: self.samples.count)
                    self.isPublishing = false
                    self.endBackgroundTask(backgroundTask)
                    self.scheduleRetry()
                    return
                }

                let accepted = value["acceptedClientSampleIds"] as? [String] ?? []
                let duplicates = value["duplicateClientSampleIds"] as? [String] ?? []
                let delivered = Set(accepted + duplicates)
                self.samples.removeAll { delivered.contains($0.clientSampleId) }
                self.persistSamples()
                let confirmed = value["currentLocationConfirmed"] as? Bool == true
                let acknowledgedAtMs = value["serverAcknowledgedAt"] as? Double
                if confirmed, let acknowledgedAtMs {
                    LiveActivityController.shared.acknowledge(
                        at: Date(timeIntervalSince1970: acknowledgedAtMs / 1_000),
                        mode: self.currentMode,
                        queueDepth: self.samples.count
                    )
                } else {
                    LiveActivityController.shared.setQueueDepth(self.samples.count)
                }
                self.emit("gps:native-publish:ack", details: [
                    "accepted": accepted.count,
                    "duplicates": duplicates.count,
                    "currentConfirmed": confirmed,
                    "queueDepth": self.samples.count
                ])
                self.isPublishing = false
                self.endBackgroundTask(backgroundTask)
                if !self.samples.isEmpty {
                    self.publishIfPossibleLocked()
                }
            }
        }.resume()
    }

    private func shouldSuppress(_ location: CLLocation) -> Bool {
        guard let config = configuration else { return false }
        let inside = config.cloakZones.contains { zone in
            let center = CLLocation(latitude: zone.lat, longitude: zone.lon)
            return location.distance(from: center) <= zone.radiusMeters
        }
        guard inside else { return false }
        if enteredCloakAt == nil { enteredCloakAt = Date() }
        if config.cloakTimeoutSeconds > 0,
           let enteredCloakAt,
           Date().timeIntervalSince(enteredCloakAt) >= config.cloakTimeoutSeconds {
            DispatchQueue.main.async { [weak self] in self?.onCloakTimeout?() }
        }
        return true
    }

    private func scheduleRetry() {
        retryWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.publishIfPossibleLocked() }
        retryWorkItem = item
        workQueue.asyncAfter(deadline: .now() + 30, execute: item)
    }

    private func emit(_ action: String, level: String = "info", details: JSObject) {
        let event: JSObject = [
            "action": action,
            "level": level,
            "details": details
        ]
        eventHandler?(event)
    }

    private func bearing(from: CLLocation, to: CLLocation) -> CLLocationDirection {
        let lat1 = from.coordinate.latitude * .pi / 180
        let lat2 = to.coordinate.latitude * .pi / 180
        let delta = (to.coordinate.longitude - from.coordinate.longitude) * .pi / 180
        let y = sin(delta) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(delta)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    private func smallestBearingDelta(_ first: CLLocationDirection, _ second: CLLocationDirection) -> Double {
        let delta = abs(first - second).truncatingRemainder(dividingBy: 360)
        return min(delta, 360 - delta)
    }

    private static func acceptedReason(_ reason: String) -> String {
        switch reason {
        case "distance", "turn", "heartbeat", "force", "recovery", "foreground":
            return reason
        case "location-relaunch", "region-exit", "significant-change":
            return "recovery"
        default:
            return "force"
        }
    }

    private var applicationSupportURL: URL {
        let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("TripCastNativeLocation", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try? fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        return directory
    }

    private var configurationURL: URL { applicationSupportURL.appendingPathComponent("config.json") }
    private var samplesURL: URL { applicationSupportURL.appendingPathComponent("queue.json") }

    private func persistSamples() {
        do {
            try persist(samples, to: samplesURL)
        } catch {
            emit("gps:native-publish:persist-failure", level: "warn", details: [
                "failureClass": "storage"
            ])
        }
    }

    private func persist<T: Encodable>(_ value: T, to url: URL) throws {
        let data = try JSONEncoder().encode(value)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func loadConfiguration() -> Configuration? {
        guard let data = try? Data(contentsOf: configurationURL) else { return nil }
        return try? JSONDecoder().decode(Configuration.self, from: data)
    }

    private func loadSamples() -> [PendingSample] {
        guard let data = try? Data(contentsOf: samplesURL) else { return [] }
        return (try? JSONDecoder().decode([PendingSample].self, from: data)) ?? []
    }

    private func isAllowedEndpoint(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        if host == "convex.cloud" || host.hasSuffix(".convex.cloud") { return true }
#if DEBUG
        return host == "localhost" || host == "127.0.0.1"
#else
        return false
#endif
    }

    private func storeToken(_ token: String) throws {
        deleteToken()
        let status = SecItemAdd([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainKey.service,
            kSecAttrAccount as String: KeychainKey.account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(token.utf8)
        ] as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    private func readToken() -> String? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainKey.service,
            kSecAttrAccount as String: KeychainKey.account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ] as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteToken() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainKey.service,
            kSecAttrAccount as String: KeychainKey.account
        ] as CFDictionary)
    }

    private func beginBackgroundTask() -> UIBackgroundTaskIdentifier {
        UIApplication.shared.beginBackgroundTask(withName: "TripCastLocationPublish")
    }

    private func endBackgroundTask(_ identifier: UIBackgroundTaskIdentifier) {
        guard identifier != .invalid else { return }
        DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(identifier) }
    }
}
