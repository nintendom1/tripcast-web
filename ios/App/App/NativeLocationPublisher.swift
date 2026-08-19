import CoreLocation
import Capacitor
import Foundation
import Network
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
        let emissionIntervalSeconds: Int
        let alertThresholdSeconds: TimeInterval
        let cloakTimeoutSeconds: TimeInterval
        let cloakZones: [CloakZone]

        private enum CodingKeys: String, CodingKey {
            case endpoint
            case liveTrailEnabled
            case emissionIntervalSeconds
            case alertThresholdSeconds
            case cloakTimeoutSeconds
            case cloakZones
        }

        init(
            endpoint: String,
            liveTrailEnabled: Bool,
            emissionIntervalSeconds: Int,
            alertThresholdSeconds: TimeInterval,
            cloakTimeoutSeconds: TimeInterval,
            cloakZones: [CloakZone]
        ) {
            self.endpoint = endpoint
            self.liveTrailEnabled = liveTrailEnabled
            self.emissionIntervalSeconds = Self.normalizedInterval(emissionIntervalSeconds)
            self.alertThresholdSeconds = alertThresholdSeconds
            self.cloakTimeoutSeconds = cloakTimeoutSeconds
            self.cloakZones = cloakZones
        }

        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            endpoint = try values.decode(String.self, forKey: .endpoint)
            liveTrailEnabled = try values.decode(Bool.self, forKey: .liveTrailEnabled)
            emissionIntervalSeconds = Self.normalizedInterval(
                try values.decodeIfPresent(Int.self, forKey: .emissionIntervalSeconds) ?? 15
            )
            alertThresholdSeconds = try values.decode(TimeInterval.self, forKey: .alertThresholdSeconds)
            cloakTimeoutSeconds = try values.decode(TimeInterval.self, forKey: .cloakTimeoutSeconds)
            cloakZones = try values.decode([CloakZone].self, forKey: .cloakZones)
        }

        private static func normalizedInterval(_ value: Int) -> Int {
            value == 0 || value == 30 ? value : 15
        }
    }

    struct PendingSample: Codable {
        let clientSampleId: String
        let lat: Double
        let lon: Double
        let accuracy: Double?
        let sampledAt: Double
        let recordTrail: Bool
        let publishCurrentLocation: Bool?
        let reason: String
    }

    private enum KeychainKey {
        static let service = "com.tripcast.app.native-location"
        static let account = "traveler-token"
    }

    private let workQueue = DispatchQueue(label: "com.tripcast.native-location-publisher")
    private let fileManager = FileManager.default
    private let pathMonitor = NWPathMonitor()
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
    private var scheduledPublishWorkItem: DispatchWorkItem?
    private var scheduledPublishAt: Date?
    private var batchStartedAt: Date?
    private var activePublishTask: URLSessionDataTask?
    private var lastEmissionLocation: CLLocation?
    private var lastEmissionAt: Date?
    private var lastBearing: CLLocationDirection?
    private var enteredCloakAt: Date?
    private var currentMode = "off"
    private var networkAvailable: Bool?
    private var publishingPhase = "idle"
    private var storageHealthy = true
    private var capacityReached = false
    private var recoveryActive = false
    private var recoveryBreadcrumbsDelivered = 0
    private var silentStopDrainActive = false
    private var sessionStartedAt: Date?
    private var sessionCapturedCount = 0
    private var sessionDurableCount = 0
    private var sessionRequestCount = 0
    private var sessionBatchSampleCount = 0
    private var sessionAcknowledgementCount = 0
    private var sessionAcknowledgementLatencyMs = 0.0
    private var failureReason: String?
    private var queueRevision = 0
    private var acknowledgedTrail: [PendingSample] = []
    private let recentTrailLimit = 100

    var eventHandler: ((JSObject) -> Void)?
    var onCloakTimeout: (() -> Void)?

    private init() {
        configuration = loadConfiguration()
        samples = loadSamples()
        recoveryActive = !samples.isEmpty
        pathMonitor.pathUpdateHandler = { [weak self] path in
            self?.handleNetworkPath(path)
        }
        pathMonitor.start(queue: workQueue)
    }

    func currentPublishingState(completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            let state = self.currentPublishingStateLocked()
            DispatchQueue.main.async { completion(state) }
        }
    }

    private func currentPublishingStateLocked() -> JSObject {
        var state: JSObject = [
            "publishingPhase": publishingPhase,
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth,
            "capacityReached": capacityReached,
            "configurationReady": configuration != nil && readToken() != nil,
            "durableStorageReady": storageHealthy,
            "queueRevision": queueRevision
        ]
        if let failureReason { state["failureReason"] = failureReason }
        return state
    }

    func localTrailSnapshot(completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            let pending = self.samples.filter(\.recordTrail).map { self.trailPoint($0, status: "pending") }
            let acknowledged = self.acknowledgedTrail.map { self.trailPoint($0, status: "acknowledged") }
            let snapshot: JSObject = ["queueRevision": queueRevision, "points": acknowledged + pending]
            DispatchQueue.main.async { completion(snapshot) }
        }
    }

    func configure(
        endpoint: String,
        token: String,
        liveTrailEnabled: Bool,
        emissionIntervalSeconds: Int,
        alertThresholdSeconds: TimeInterval,
        cloakTimeoutSeconds: TimeInterval,
        cloakZones: [CloakZone],
        completion: @escaping (Result<JSObject, Error>) -> Void
    ) {
        workQueue.async { [weak self] in
            guard let self else { return }
            do {
            guard let url = URL(string: endpoint), isAllowedEndpoint(url) else {
                throw NSError(
                    domain: "TripCastNativeLocation",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "The native location endpoint is not allowed."]
                )
            }
            let identityChanged = readToken().map { $0 != token } ?? false
            try storeToken(token)
            let next = Configuration(
                endpoint: endpoint,
                liveTrailEnabled: liveTrailEnabled,
                emissionIntervalSeconds: emissionIntervalSeconds,
                alertThresholdSeconds: max(0, alertThresholdSeconds),
                cloakTimeoutSeconds: max(0, cloakTimeoutSeconds),
                cloakZones: cloakZones
            )
            generation += 1
            isPublishing = false
            activePublishTask?.cancel()
            activePublishTask = nil
            cancelScheduledPublishLocked()
            configuration = next
            do {
                try persist(next, to: configurationURL)
                storageHealthy = true
                failureReason = nil
            } catch {
                storageHealthy = false
                failureReason = "configuration-persistence-failed"
                publishingPhase = "storage-error"
                throw error
            }
            if identityChanged {
                acknowledgedTrail.removeAll()
                queueRevision += 1
            }
            publishingPhase = samples.isEmpty
                ? "healthy"
                : (networkAvailable == false ? "offline" : "syncing")
            emit("gps:native-publish:configured", details: [
                "emissionIntervalSeconds": next.emissionIntervalSeconds,
                "queueDepth": samples.count
            ])
            publishIfPossibleLocked(reason: "configuration")
            let state = currentPublishingStateLocked()
            DispatchQueue.main.async { completion(.success(state)) }
            } catch {
                let state = currentPublishingStateLocked()
                DispatchQueue.main.async {
                    self.eventHandler?(state)
                    completion(.failure(error))
                }
            }
        }
    }

    func startLive(mode: String, completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            if self.currentMode == "off" {
                self.sessionStartedAt = Date()
                self.sessionCapturedCount = 0
                self.sessionDurableCount = 0
                self.sessionRequestCount = 0
                self.sessionBatchSampleCount = 0
                self.sessionAcknowledgementCount = 0
                self.sessionAcknowledgementLatencyMs = 0
            }
            self.currentMode = mode
            self.publishingPhase = self.networkAvailable == false
                ? "offline"
                : (self.recoveryActive && !self.samples.isEmpty ? "syncing" : "healthy")
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
            self.emit("gps:native-publish:live-started", details: [
                "queueDepth": self.samples.count,
                "breadcrumbQueueDepth": self.breadcrumbQueueDepth
            ])
            self.publishIfPossibleLocked(reason: "live-start", force: self.recoveryActive)
            let state = self.currentPublishingStateLocked()
            DispatchQueue.main.async { completion(state) }
        }
    }

    func setMode(_ mode: String) {
        workQueue.async { [weak self] in
            guard let self else { return }
            self.currentMode = mode
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
        }
    }

    func stopLive(
        clearCredentials: Bool,
        preserveSamples: Bool,
        suppressedBridgeEvents: Int,
        completion: @escaping (JSObject) -> Void
    ) {
        workQueue.async { [weak self] in
            guard let self else { return }
            generation += 1
            isPublishing = false
            activePublishTask?.cancel()
            activePublishTask = nil
            cancelScheduledPublishLocked()
            currentMode = "off"
            lastEmissionLocation = nil
            lastEmissionAt = nil
            lastBearing = nil
            enteredCloakAt = nil
            emitSessionSummaryLocked(
                reason: "stop",
                suppressedBridgeEvents: suppressedBridgeEvents
            )
            if preserveSamples, !clearCredentials {
                silentStopDrainActive = !recoveryActive && networkAvailable != false && storageHealthy
                samples = samples.map { sample in
                    PendingSample(
                        clientSampleId: sample.clientSampleId,
                        lat: sample.lat,
                        lon: sample.lon,
                        accuracy: sample.accuracy,
                        sampledAt: sample.sampledAt,
                        recordTrail: sample.recordTrail,
                        publishCurrentLocation: false,
                        reason: sample.reason
                    )
                }
                recoveryActive = !samples.isEmpty
                recoveryBreadcrumbsDelivered = 0
                persistSamples()
                if storageHealthy {
                    publishingPhase = samples.isEmpty
                        ? "idle"
                        : (networkAvailable == false ? "offline" : "syncing")
                }
                emit("gps:native-publish:preserved", details: [
                    "queueDepth": samples.count,
                    "breadcrumbQueueDepth": breadcrumbQueueDepth
                ])
                publishIfPossibleLocked(reason: "healthy-live-stop", force: true)
            } else {
                samples.removeAll()
                acknowledgedTrail.removeAll()
                queueRevision += 1
                try? fileManager.removeItem(at: samplesURL)
                publishingPhase = "idle"
                storageHealthy = true
                capacityReached = false
                recoveryActive = false
                recoveryBreadcrumbsDelivered = 0
                batchStartedAt = nil
                silentStopDrainActive = false
            }
            if clearCredentials {
                configuration = nil
                try? fileManager.removeItem(at: configurationURL)
                deleteToken()
                acknowledgedTrail.removeAll()
                queueRevision += 1
            }
            emit("gps:native-publish:stopped", details: ["queueDepth": samples.count])
            let state = currentPublishingStateLocked()
            DispatchQueue.main.async { completion(state) }
        }
    }

    func emitSessionSummary(reason: String, suppressedBridgeEvents: Int) {
        workQueue.async { [weak self] in
            self?.emitSessionSummaryLocked(
                reason: reason,
                suppressedBridgeEvents: suppressedBridgeEvents
            )
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
                publishCurrentLocation: true,
                reason: acceptedReason
            )
            if self.samples.isEmpty || (self.isPublishing && self.batchStartedAt == nil) {
                self.batchStartedAt = Date()
            }
            self.samples.append(sample)
            self.queueRevision += 1
            self.sessionCapturedCount += 1
            if self.samples.count > self.maxQueueDepth {
                self.samples.removeFirst(self.samples.count - self.maxQueueDepth)
                self.capacityReached = true
                self.recoveryActive = true
                self.emit("gps:native-publish:queue-capacity", level: "warn", details: [
                    "queueDepth": self.samples.count
                ])
            }
            self.lastEmissionLocation = location
            self.lastEmissionAt = now
            self.lastBearing = bearing
            self.persistSamples()
            if self.storageHealthy { self.sessionDurableCount += 1 }
            if !self.storageHealthy {
                self.publishingPhase = "storage-error"
            } else if self.networkAvailable == false {
                self.publishingPhase = "offline"
                self.recoveryActive = true
            } else {
                self.publishingPhase = self.recoveryActive ? "syncing" : "healthy"
            }
            LiveActivityController.shared.setQueueDepth(self.samples.count)
            if self.recoveryActive, self.scheduledPublishWorkItem != nil {
                return
            }
            self.publishIfPossibleLocked(
                reason: self.samples.count >= 20 ? "queue-limit" : "sample-accepted",
                force: self.samples.count >= 20
            )
        }
    }

    func publishIfPossible() {
        workQueue.async { [weak self] in
            self?.publishIfPossibleLocked(reason: "recovery", force: true)
        }
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
                var details: JSObject = [:]
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

    private func publishIfPossibleLocked(reason: String, force: Bool = false) {
        guard !isPublishing, !samples.isEmpty,
              let config = configuration,
              let token = readToken(),
              let baseURL = URL(string: config.endpoint) else { return }
        guard networkAvailable != false else {
            publishingPhase = "offline"
            recoveryActive = true
            emit("gps:native-publish:offline", level: "warn", details: [
                "queueDepth": samples.count,
                "breadcrumbQueueDepth": breadcrumbQueueDepth
            ])
            return
        }
        let shouldFlushNow = force ||
            config.emissionIntervalSeconds == 0 ||
            samples.count >= 20 ||
            recoveryActive
        guard shouldFlushNow else {
            scheduleBatchFlushLocked(intervalSeconds: config.emissionIntervalSeconds)
            return
        }
        cancelScheduledPublishLocked()
        isPublishing = true
        publishingPhase = recoveryActive ? "syncing" : "healthy"
        let requestGeneration = generation
        let batch = Array(samples.prefix(20))
        let hadQueuedRemainderAtStart = samples.count > batch.count
        batchStartedAt = nil
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
                "publishCurrentLocation": sample.publishCurrentLocation ?? true,
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
        let requestStartedAt = Date()
        sessionRequestCount += 1
        sessionBatchSampleCount += batch.count
        emit("gps:native-publish:flush", details: [
            "reason": reason,
            "batchSize": batch.count,
            "queueDepth": samples.count,
            "requestCount": sessionRequestCount
        ])
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.workQueue.async {
                guard let self else { return }
                guard requestGeneration == self.generation else {
                    self.endBackgroundTask(backgroundTask)
                    return
                }
                self.activePublishTask = nil
                let httpStatus = (response as? HTTPURLResponse)?.statusCode
                guard error == nil,
                      let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode),
                      let data,
                      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      root["status"] as? String == "success",
                      let value = root["value"] as? [String: Any] else {
                    var details: JSObject = [
                        "queueDepth": self.samples.count,
                        "failureClass": error == nil ? "server" : "network"
                    ]
                    if let httpStatus { details["httpStatus"] = httpStatus }
                    if let urlError = error as? URLError {
                        details["networkCode"] = urlError.code.rawValue
                        details["networkReason"] = Self.safeNetworkReason(urlError.code)
                    }
                    self.publishingPhase = error == nil ? "retrying" : "offline"
                    self.recoveryActive = true
                    self.emit("gps:native-publish:failure", level: "warn", details: details)
                    LiveActivityController.shared.setRecovering(queueDepth: self.samples.count)
                    self.isPublishing = false
                    self.endBackgroundTask(backgroundTask)
                    self.scheduleRetry()
                    return
                }

                let accepted = value["acceptedClientSampleIds"] as? [String] ?? []
                let duplicates = value["duplicateClientSampleIds"] as? [String] ?? []
                let delivered = Set(accepted + duplicates)
                let acknowledged = batch.filter {
                    delivered.contains($0.clientSampleId) && $0.recordTrail
                }
                self.acknowledgedTrail.append(contentsOf: acknowledged)
                if self.acknowledgedTrail.count > self.recentTrailLimit {
                    self.acknowledgedTrail.removeFirst(self.acknowledgedTrail.count - self.recentTrailLimit)
                }
                let deliveredBreadcrumbs = batch.filter {
                    delivered.contains($0.clientSampleId) && $0.recordTrail
                }.count
                self.samples.removeAll { delivered.contains($0.clientSampleId) }
                if !delivered.isEmpty { self.queueRevision += 1 }
                self.persistSamples()
                self.capacityReached = self.samples.count >= self.maxQueueDepth
                let acknowledgementLatencyMs = Date().timeIntervalSince(requestStartedAt) * 1_000
                self.sessionAcknowledgementCount += 1
                self.sessionAcknowledgementLatencyMs += acknowledgementLatencyMs
                if self.recoveryActive {
                    self.recoveryBreadcrumbsDelivered += deliveredBreadcrumbs
                }
                let confirmed = value["currentLocationConfirmed"] as? Bool == true
                let acknowledgedAtMs = value["serverAcknowledgedAt"] as? Double
                LiveActivityController.shared.setPublishingHealthy(queueDepth: self.samples.count)
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
                    "acknowledgementLatencyMs": Int(acknowledgementLatencyMs.rounded()),
                    "remainingQueueDepth": self.samples.count
                ])
                self.isPublishing = false
                self.endBackgroundTask(backgroundTask)
                if !self.storageHealthy {
                    self.publishingPhase = "storage-error"
                } else if !self.samples.isEmpty {
                    self.publishingPhase = "syncing"
                    self.publishIfPossibleLocked(
                        reason: hadQueuedRemainderAtStart ? "batch-remainder" : "sample-accepted",
                        force: hadQueuedRemainderAtStart || self.recoveryActive
                    )
                } else {
                    self.batchStartedAt = nil
                    self.publishingPhase = self.currentMode == "off" ? "idle" : "healthy"
                    if self.recoveryActive {
                        let completed = self.recoveryBreadcrumbsDelivered
                        self.recoveryActive = false
                        self.recoveryBreadcrumbsDelivered = 0
                        if self.silentStopDrainActive {
                            self.silentStopDrainActive = false
                            self.emit("gps:native-publish:silent-stop-drain-complete", details: [
                                "deliveredBreadcrumbCount": completed,
                                "queueDepth": 0
                            ])
                        } else {
                            self.emit("gps:native-publish:drain-complete", details: [
                                "completedDrainCount": completed
                            ], completedDrainCount: completed)
                        }
                    } else {
                        self.emit("gps:native-publish:queue-empty", details: [
                            "queueDepth": 0,
                            "breadcrumbQueueDepth": 0
                        ])
                    }
                }
            }
        }
        activePublishTask = task
        task.resume()
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

    private func scheduleBatchFlushLocked(intervalSeconds: Int) {
        let startedAt = batchStartedAt ?? Date()
        batchStartedAt = startedAt
        let fireAt = startedAt.addingTimeInterval(TimeInterval(intervalSeconds))
        if let scheduledPublishAt, scheduledPublishAt <= fireAt { return }
        schedulePublishLocked(
            after: max(0, fireAt.timeIntervalSinceNow),
            reason: "interval",
            force: true
        )
        emit("gps:native-publish:batch-scheduled", details: [
            "emissionIntervalSeconds": intervalSeconds,
            "delayMs": Int(max(0, fireAt.timeIntervalSinceNow) * 1_000),
            "queueDepth": samples.count
        ])
    }

    private func schedulePublishLocked(after delay: TimeInterval, reason: String, force: Bool) {
        cancelScheduledPublishLocked()
        let fireAt = Date().addingTimeInterval(delay)
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.scheduledPublishWorkItem = nil
            self.scheduledPublishAt = nil
            self.publishIfPossibleLocked(reason: reason, force: force)
        }
        scheduledPublishWorkItem = item
        scheduledPublishAt = fireAt
        workQueue.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func cancelScheduledPublishLocked() {
        scheduledPublishWorkItem?.cancel()
        scheduledPublishWorkItem = nil
        scheduledPublishAt = nil
    }

    private func scheduleRetry() {
        schedulePublishLocked(after: 30, reason: "retry", force: true)
    }

    private func emitSessionSummaryLocked(reason: String, suppressedBridgeEvents: Int) {
        let averageBatchSize = sessionRequestCount > 0
            ? Double(sessionBatchSampleCount) / Double(sessionRequestCount)
            : 0
        let averageAcknowledgementLatencyMs = sessionAcknowledgementCount > 0
            ? sessionAcknowledgementLatencyMs / Double(sessionAcknowledgementCount)
            : 0
        emit("gps:native-publish:session-summary", details: [
            "reason": reason,
            "capturedPointCount": sessionCapturedCount,
            "durablePointCount": sessionDurableCount,
            "requestCount": sessionRequestCount,
            "averageBatchSize": (averageBatchSize * 10).rounded() / 10,
            "averageAcknowledgementLatencyMs": Int(averageAcknowledgementLatencyMs.rounded()),
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth,
            "suppressedBridgeEventCount": suppressedBridgeEvents,
            "sessionDurationMs": Int(Date().timeIntervalSince(sessionStartedAt ?? Date()) * 1_000),
            "thermalState": Self.thermalStateDescription(ProcessInfo.processInfo.thermalState)
        ])
    }

    private var breadcrumbQueueDepth: Int {
        samples.filter { $0.recordTrail }.count
    }

    private func handleNetworkPath(_ path: NWPath) {
        let wasAvailable = networkAvailable
        networkAvailable = path.status == .satisfied
        if networkAvailable == false {
            cancelScheduledPublishLocked()
            if currentMode != "off" || !samples.isEmpty {
                recoveryActive = true
                publishingPhase = "offline"
            } else {
                publishingPhase = "idle"
            }
            emit("gps:native-publish:network-offline", level: "warn", details: [
                "queueDepth": samples.count,
                "breadcrumbQueueDepth": breadcrumbQueueDepth
            ])
            return
        }

        publishingPhase = samples.isEmpty ? (currentMode == "off" ? "idle" : "healthy") : "syncing"
        emit("gps:native-publish:network-online", details: [
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth
        ])
        if wasAvailable != true, !samples.isEmpty {
            emit("gps:native-publish:recovery", details: [
                "reason": "network-restored",
                "queueDepth": samples.count
            ])
            publishIfPossibleLocked(reason: "network-restored", force: true)
        }
    }

    private func emit(
        _ action: String,
        level: String = "info",
        details: JSObject,
        completedDrainCount: Int? = nil
    ) {
        var event: JSObject = [
            "action": action,
            "level": level,
            "details": details,
            "publishingPhase": publishingPhase,
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth,
            "capacityReached": capacityReached,
            "queueRevision": queueRevision
        ]
        if let completedDrainCount { event["completedDrainCount"] = completedDrainCount }
        DispatchQueue.main.async { [weak self] in
            self?.eventHandler?(event)
        }
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

    private static func safeNetworkReason(_ code: URLError.Code) -> String {
        switch code {
        case .cancelled: return "cancelled"
        case .timedOut: return "timed-out"
        case .cannotFindHost: return "cannot-find-host"
        case .cannotConnectToHost: return "cannot-connect-to-host"
        case .networkConnectionLost: return "connection-lost"
        case .dnsLookupFailed: return "dns-lookup-failed"
        case .notConnectedToInternet: return "offline"
        case .secureConnectionFailed: return "secure-connection-failed"
        default: return "other"
        }
    }

    private static func thermalStateDescription(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
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
            storageHealthy = true
            failureReason = nil
        } catch {
            storageHealthy = false
            failureReason = "queue-persistence-failed"
            publishingPhase = "storage-error"
            recoveryActive = true
            emit("gps:native-publish:persist-failure", level: "warn", details: [
                "failureClass": "storage"
            ])
            LiveActivityController.shared.setRecovering(queueDepth: samples.count)
        }
    }

    private func trailPoint(_ sample: PendingSample, status: String) -> JSObject {
        [
            "clientSampleId": sample.clientSampleId,
            "lat": sample.lat,
            "lon": sample.lon,
            "sampledAt": sample.sampledAt,
            "status": status
        ]
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
