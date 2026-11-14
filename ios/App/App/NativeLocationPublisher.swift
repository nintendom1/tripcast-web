import CoreLocation
import Capacitor
import Foundation
import Network
import Security
import UIKit

final class NativeLocationPublisher {
    static let shared = NativeLocationPublisher()

    struct CloakZone: Codable, Equatable {
        let lat: Double
        let lon: Double
        let radiusMeters: Double
    }

    struct UsageGuard: Codable, Equatable {
        let bytesPerUpload: Double
        let monthlyLimitBytes: Double
        let pausePercent: Double
    }

    struct Configuration: Codable, Equatable {
        let endpoint: String
        let liveTrailEnabled: Bool
        let movementDetectionEnabled: Bool
        let emissionIntervalSeconds: Int
        let alertThresholdSeconds: TimeInterval
        let cloakTimeoutSeconds: TimeInterval
        let cloakZones: [CloakZone]
        let includeDebugMysteryMissions: Bool
        let usageGuard: UsageGuard?
        var captureTripId: String?
        var publishingEpoch: Int?
        var tripTitle: String?

        private enum CodingKeys: String, CodingKey {
            case endpoint
            case liveTrailEnabled
            case movementDetectionEnabled
            case emissionIntervalSeconds
            case alertThresholdSeconds
            case cloakTimeoutSeconds
            case cloakZones
            case includeDebugMysteryMissions
            case usageGuard
            case captureTripId
            case publishingEpoch
            case tripTitle
        }

        init(
            endpoint: String,
            liveTrailEnabled: Bool,
            movementDetectionEnabled: Bool,
            emissionIntervalSeconds: Int,
            alertThresholdSeconds: TimeInterval,
            cloakTimeoutSeconds: TimeInterval,
            cloakZones: [CloakZone],
            includeDebugMysteryMissions: Bool,
            usageGuard: UsageGuard?,
            captureTripId: String?,
            publishingEpoch: Int?,
            tripTitle: String?
        ) {
            self.endpoint = endpoint
            self.liveTrailEnabled = liveTrailEnabled
            self.movementDetectionEnabled = movementDetectionEnabled
            self.emissionIntervalSeconds = Self.normalizedInterval(emissionIntervalSeconds)
            self.alertThresholdSeconds = alertThresholdSeconds
            self.cloakTimeoutSeconds = cloakTimeoutSeconds
            self.cloakZones = cloakZones
            self.includeDebugMysteryMissions = includeDebugMysteryMissions
            self.usageGuard = usageGuard
            self.captureTripId = captureTripId
            self.publishingEpoch = publishingEpoch
            self.tripTitle = tripTitle
        }

        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            endpoint = try values.decode(String.self, forKey: .endpoint)
            liveTrailEnabled = try values.decode(Bool.self, forKey: .liveTrailEnabled)
            movementDetectionEnabled = try values.decodeIfPresent(
                Bool.self,
                forKey: .movementDetectionEnabled
            ) ?? false
            emissionIntervalSeconds = Self.normalizedInterval(
                try values.decodeIfPresent(Int.self, forKey: .emissionIntervalSeconds) ?? 15
            )
            alertThresholdSeconds = try values.decode(TimeInterval.self, forKey: .alertThresholdSeconds)
            cloakTimeoutSeconds = try values.decode(TimeInterval.self, forKey: .cloakTimeoutSeconds)
            cloakZones = try values.decode([CloakZone].self, forKey: .cloakZones)
            includeDebugMysteryMissions = try values.decodeIfPresent(
                Bool.self,
                forKey: .includeDebugMysteryMissions
            ) ?? false
            usageGuard = try values.decodeIfPresent(UsageGuard.self, forKey: .usageGuard)
            captureTripId = try values.decodeIfPresent(String.self, forKey: .captureTripId)
            publishingEpoch = try values.decodeIfPresent(Int.self, forKey: .publishingEpoch)
            tripTitle = try values.decodeIfPresent(String.self, forKey: .tripTitle)
        }

        /// True when `previous` differs from this configuration in the trip tags or title and nothing else.
        func changesOnlyPublishingTags(from previous: Configuration) -> Bool {
            guard captureTripId != previous.captureTripId ||
                    publishingEpoch != previous.publishingEpoch ||
                    tripTitle != previous.tripTitle else { return false }
            var retagged = previous
            retagged.captureTripId = captureTripId
            retagged.publishingEpoch = publishingEpoch
            retagged.tripTitle = tripTitle
            return retagged == self
        }

        private static func normalizedInterval(_ value: Int) -> Int {
            value == 0 || value == 30 ? value : 15
        }
    }

    // Synthesized Codable decodes every optional with decodeIfPresent, so a queue.json written
    // before the trip tags existed still loads (with nil tags).
    struct PendingSample: Codable {
        let clientSampleId: String
        let lat: Double
        let lon: Double
        let accuracy: Double?
        let sampledAt: Double
        let recordTrail: Bool
        var publishCurrentLocation: Bool?
        let reason: String
        var parked: Bool? = nil
        var captureTripId: String? = nil
        var publishingEpoch: Int? = nil

        /// The ingest sample payload; trip tags are sent only when the sample was captured with them.
        var uploadPayload: [String: Any] {
            var value: [String: Any] = [
                "clientSampleId": clientSampleId,
                "lat": lat,
                "lon": lon,
                "sampledAt": sampledAt,
                "recordTrail": recordTrail,
                "publishCurrentLocation": publishCurrentLocation ?? true,
                "reason": reason
            ]
            if let accuracy { value["accuracy"] = accuracy }
            if parked == true { value["parked"] = true }
            if let captureTripId { value["tripId"] = captureTripId }
            if let publishingEpoch { value["epoch"] = publishingEpoch }
            return value
        }
    }

    /// How the ingest response classified one batch. Every field is optional on the wire, so a
    /// server that sends only accepted and duplicate ids yields today's behaviour.
    struct IngestOutcome {
        /// Ids that leave the queue: accepted and duplicates, plus any classified id.
        let delivered: Set<String>
        let historical: Set<String>
        /// Discarded or quarantined: removed from the queue but never recorded in the trail.
        let unrecorded: Set<String>
        /// Delivered samples that may join the local acknowledged trail.
        let trailAcknowledged: Set<String>
        /// Delivered samples the server applied as the current location.
        let appliedAsCurrent: Set<String>
        let publishingState: String?
        let currentTripId: String?
        let currentEpoch: Int?

        init(response value: [String: Any]) {
            func ids(_ key: String) -> Set<String> { Set(value[key] as? [String] ?? []) }
            historical = ids("historicalClientSampleIds")
            unrecorded = ids("discardedClientSampleIds").union(ids("quarantinedClientSampleIds"))
            delivered = ids("acceptedClientSampleIds")
                .union(ids("duplicateClientSampleIds"))
                .union(historical)
                .union(unrecorded)
            trailAcknowledged = delivered.subtracting(unrecorded)
            appliedAsCurrent = trailAcknowledged.subtracting(historical)
            let publishing = value["publishing"] as? [String: Any]
            publishingState = publishing?["state"] as? String
            currentTripId = publishing?["currentTripId"] as? String
            currentEpoch = (publishing?["epoch"] as? NSNumber)?.intValue
        }

        /// The epoch is the authority: a session ends when the server's current epoch differs from the
        /// one it started under, whatever the state says. A "revoked" state with a matching epoch only
        /// concerns older queued samples from an earlier session. Without both epochs, the state decides.
        func revokes(sessionEpoch: Int?) -> Bool {
            if let currentEpoch, let sessionEpoch { return currentEpoch != sessionEpoch }
            return publishingState == "revoked"
        }
    }

    struct PendingMotion: Codable, Equatable {
        let classification: String
        let sampledAt: Double
    }

    struct PendingMysteryCompletion: Codable, Equatable {
        let mysteryMissionId: String
        let clientTriggerId: String
        let queuedAt: Double
        let debugArrival: Bool?
    }

    private enum FailureClass: String {
        case network
        case server
        case rateLimited = "rate-limited"
        case rejected
        case auth
    }

    private struct UsageFailures: Codable {
        var network = 0
        var server = 0
        var rateLimited = 0
        var auth = 0
        var paused = 0
        var rejected = 0
    }

    private struct UsageBucket: Codable {
        var hourStart: Double
        var requests = 0
        var uploads: Int? = nil
        var samplesSent = 0
        var samplesAcked = 0
        var bytesSent = 0
        var bytesReceived = 0
        var retries = 0
        var failures = UsageFailures()
        var samplesSetAside = 0
        var samplesThinned = 0
        var secondsByMode: [String: Double] = [:]

        var hasActivity: Bool {
            requests > 0 || (uploads ?? 0) > 0 || samplesThinned > 0 || samplesSetAside > 0 ||
                !secondsByMode.isEmpty
        }

        var completeness: Double {
            Double(requests + (uploads ?? 0)) + secondsByMode.values.reduce(0, +)
        }

        var jsObject: JSObject {
            [
                "hourStart": hourStart,
                "requests": requests,
                "uploads": uploads ?? 0,
                "samplesSent": samplesSent,
                "samplesAcked": samplesAcked,
                "bytesSent": bytesSent,
                "bytesReceived": bytesReceived,
                "retries": retries,
                "failures": [
                    "network": failures.network,
                    "server": failures.server,
                    "rateLimited": failures.rateLimited,
                    "auth": failures.auth,
                    "paused": failures.paused,
                    "rejected": failures.rejected
                ] as JSObject,
                "samplesSetAside": samplesSetAside,
                "samplesThinned": samplesThinned,
                "secondsByMode": secondsByMode.reduce(into: JSObject()) { result, entry in
                    result[entry.key] = Int(entry.value.rounded())
                }
            ]
        }
    }

    private enum KeychainKey {
        static let service = "com.tripcast.app.native-location"
        static let account = "traveler-token"
    }

    private let workQueue = DispatchQueue(label: "com.tripcast.native-location-publisher")
    private let fileManager = FileManager.default
    private let pathMonitor = NWPathMonitor()
    private let maxQueueDepth = 10_000
    private let maxBatchSize = 20
    private let thinningWindow = 2_000
    private let persistThrottleQueueDepth = 200
    private let persistThrottleInterval: TimeInterval = 15
    private let maxSetAsideSamples = 500
    private let maxUsageBuckets = 840
    private let maxModeAccrualGap: TimeInterval = 7 * 24 * 3_600
    private let networkBackoffSeconds: [TimeInterval] = [5, 15, 30, 60, 120, 300]
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
    private var pendingMotion: PendingMotion?
    private var mysteryCompletions: [PendingMysteryCompletion] = []
    private var mysteryCompletionInFlight = false
    private var activeMysteryCompletionTask: URLSessionDataTask?
    private var scheduledMysteryRetryWorkItem: DispatchWorkItem?
    private var motionPublishInFlight = false
    private var activeMotionPublishTask: URLSessionDataTask?
    private var scheduledMotionPublishWorkItem: DispatchWorkItem?
    private var lastAcknowledgedMotionClassification: String?
    private var motionPublishStatus = "idle"
    private var motionPublishFailureReason: String?
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
    private var failureAttempts: [FailureClass: Int] = [:]
    private var consecutiveFailures = 0
    private var signInExpired = false
    private var pausedSince: Date?
    private var parkedMarkerDelivered = false
    private var lastSamplesPersistAt: Date?
    private var scheduledPersistWorkItem: DispatchWorkItem?
    private var usageHistory: [UsageBucket] = []
    private var usageCurrent = UsageBucket(hourStart: 0)
    private var usageHistoryDirty = false
    private var usageModeSince: Date?
    /// Set once a session is revoked; capture and motion stay held until the next session starts.
    private var publishingRevocationHandled = false
    /// Tags of the latest live session, fixed when it starts (seeded from the persisted configuration
    /// at launch, so a snooze that outlives the process keeps its tags). Samples are stamped with these,
    /// never with a newer configuration, so a session cannot drift onto another trip or gain an epoch.
    private var sessionCaptureTripId: String?
    private var sessionPublishingEpoch: Int?

    var eventHandler: ((JSObject) -> Void)?
    var onCloakTimeout: (() -> Void)?
    /// Called on the main queue once per revocation with event details (`capturing`, `source`,
    /// `reason` "trip-changed" or "tags-introduced", optional `currentTripId`/`epoch`). The service
    /// decides whether a session needs stopping.
    var onPublishingRevoked: ((JSObject) -> Void)?
    /// Called synchronously on workQueue: clears the persisted Live request and snooze.
    var clearPersistedLiveRequest: (() -> Void)?

    private init() {
        configuration = loadConfiguration()
        sessionCaptureTripId = configuration?.captureTripId
        sessionPublishingEpoch = configuration?.publishingEpoch
        samples = loadSamples()
        pendingMotion = loadPendingMotion()
        mysteryCompletions = loadMysteryCompletions()
        let loadedHistory = loadDecoded([UsageBucket].self, from: usageHistoryURL) ?? []
        let loadedCurrent = loadDecoded(UsageBucket.self, from: usageCurrentURL)
            ?? UsageBucket(hourStart: Self.hourStart(of: Date()))
        var bucketsByHour: [Double: UsageBucket] = [:]
        for bucket in loadedHistory + [loadedCurrent] {
            if let existing = bucketsByHour[bucket.hourStart], existing.completeness >= bucket.completeness {
                continue
            }
            bucketsByHour[bucket.hourStart] = bucket
        }
        usageCurrent = bucketsByHour.removeValue(forKey: loadedCurrent.hourStart) ?? loadedCurrent
        usageHistory = bucketsByHour.values.sorted { $0.hourStart < $1.hourStart }
        usageHistoryDirty = usageHistory.count != loadedHistory.count
        motionPublishStatus = pendingMotion == nil ? "idle" : "pending"
        recoveryActive = !samples.isEmpty
        if let tripTitle = configuration?.tripTitle {
            LiveActivityController.shared.setTripTitle(tripTitle)
        }
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
            "publishingPhase": reportedPublishingPhase,
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth,
            "capacityReached": capacityReached,
            "configurationReady": configuration != nil && readToken() != nil,
            "liveTrailEnabled": configuration?.liveTrailEnabled == true,
            "durableStorageReady": storageHealthy,
            "motionPublishStatus": motionPublishStatus,
            "motionPendingClassification": pendingMotion?.classification ?? NSNull(),
            "motionPublishFailureReason": motionPublishFailureReason ?? NSNull(),
            "queueRevision": queueRevision
        ]
        if let failureReason { state["failureReason"] = failureReason }
        return state
    }

    func localTrailSnapshot(completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            // Only the current trip's points: after a switch the old trip's trail is not drawn.
            let tripId = self.configuration?.captureTripId
            let pending = self.samples.filter { $0.recordTrail && $0.captureTripId == tripId }
                .map { self.trailPoint($0, status: "pending") }
            let acknowledged = self.acknowledgedTrail.filter { $0.captureTripId == tripId }
                .map { self.trailPoint($0, status: "acknowledged") }
            let snapshot: JSObject = ["queueRevision": queueRevision, "points": acknowledged + pending]
            DispatchQueue.main.async { completion(snapshot) }
        }
    }

    func configure(
        endpoint: String,
        token: String,
        liveTrailEnabled: Bool,
        movementDetectionEnabled: Bool,
        emissionIntervalSeconds: Int,
        alertThresholdSeconds: TimeInterval,
        cloakTimeoutSeconds: TimeInterval,
        cloakZones: [CloakZone],
        includeDebugMysteryMissions: Bool,
        usageGuard: UsageGuard?,
        captureTripId: String?,
        publishingEpoch: Int?,
        tripTitle: String?,
        liveSessionRequested: Bool,
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
                movementDetectionEnabled: movementDetectionEnabled,
                emissionIntervalSeconds: emissionIntervalSeconds,
                alertThresholdSeconds: max(0, alertThresholdSeconds),
                cloakTimeoutSeconds: max(0, cloakTimeoutSeconds),
                cloakZones: cloakZones,
                includeDebugMysteryMissions: includeDebugMysteryMissions,
                usageGuard: usageGuard,
                captureTripId: captureTripId,
                publishingEpoch: publishingEpoch,
                tripTitle: tripTitle
            )
            let previous = configuration
            // A trip switch only retags future samples: queued samples keep their tags and the
            // in-flight upload stays valid, so it is not cancelled.
            let tagsOnly = !identityChanged && !signInExpired &&
                previous.map { next.changesOnlyPublishingTags(from: $0) } == true
            if !tagsOnly {
                generation += 1
                isPublishing = false
                activePublishTask?.cancel()
                activePublishTask = nil
                cancelScheduledPublishLocked()
                activeMotionPublishTask?.cancel()
                activeMotionPublishTask = nil
                motionPublishInFlight = false
                scheduledMotionPublishWorkItem?.cancel()
                scheduledMotionPublishWorkItem = nil
            }
            // An epoch other than the session's ends a live, requested or snoozed session before the
            // tags are adopted; they apply to future sessions only. A session started without an epoch
            // never adopts one (native cannot tell whether a switch happened meanwhile). A nil epoch
            // is no information, so a 5 -> nil -> 6 flicker still stops at 6.
            if let nextEpoch = next.publishingEpoch,
               nextEpoch != sessionPublishingEpoch,
               currentMode != "off" || liveSessionRequested {
                // Before the new tags are assigned and persisted: a process death in between must not
                // let a relaunch restore Live under the new epoch.
                clearPersistedLiveRequest?()
                handlePublishingRevokedLocked(
                    source: "reconfigured",
                    reason: sessionPublishingEpoch == nil ? "tags-introduced" : "trip-changed",
                    currentTripId: next.captureTripId,
                    currentEpoch: nextEpoch
                )
            }
            if previous?.captureTripId != next.captureTripId { queueRevision += 1 }
            configuration = next
            LiveActivityController.shared.setTripTitle(next.tripTitle)
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
            if tagsOnly {
                if publishingPhase == "storage-error" {
                    publishingPhase = samples.isEmpty
                        ? "healthy"
                        : (networkAvailable == false ? "offline" : "syncing")
                }
                emit("gps:native-publish:configured", details: [
                    "emissionIntervalSeconds": next.emissionIntervalSeconds,
                    "movementDetectionEnabled": next.movementDetectionEnabled,
                    "queueDepth": samples.count,
                    "publishingTagsOnly": true
                ])
                let state = currentPublishingStateLocked()
                DispatchQueue.main.async { completion(.success(state)) }
                return
            }
            if identityChanged {
                acknowledgedTrail.removeAll()
                queueRevision += 1
                clearPendingMotionLocked()
                lastAcknowledgedMotionClassification = nil
                self.clearMysteryCompletionsLocked()
                MysteryProximityService.shared.clearIdentity()
            } else if !next.movementDetectionEnabled {
                clearPendingMotionLocked()
                lastAcknowledgedMotionClassification = nil
            }
            publishingPhase = samples.isEmpty
                ? "healthy"
                : (networkAvailable == false ? "offline" : "syncing")
            emit("gps:native-publish:configured", details: [
                "emissionIntervalSeconds": next.emissionIntervalSeconds,
                "movementDetectionEnabled": next.movementDetectionEnabled,
                "queueDepth": samples.count
            ])
            let resumeHeldMotion = signInExpired
            signInExpired = false
            evaluateUsageGuardLocked(trigger: "configuration")
            publishIfPossibleLocked(reason: "configuration")
            publishMysteryCompletionIfPossibleLocked(reason: "configuration")
            if resumeHeldMotion { publishMotionIfPossibleLocked(reason: "configuration") }
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
                self.publishingRevocationHandled = false
                self.sessionCaptureTripId = self.configuration?.captureTripId
                self.sessionPublishingEpoch = self.configuration?.publishingEpoch
                self.sessionStartedAt = Date()
                self.sessionCapturedCount = 0
                self.sessionDurableCount = 0
                self.sessionRequestCount = 0
                self.sessionBatchSampleCount = 0
                self.sessionAcknowledgementCount = 0
                self.sessionAcknowledgementLatencyMs = 0
            }
            self.setCurrentModeLocked(mode)
            self.publishingPhase = self.networkAvailable == false
                ? "offline"
                : (self.recoveryActive && !self.samples.isEmpty ? "syncing" : "healthy")
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
            self.evaluateUsageGuardLocked(trigger: "live-start")
            if self.pausedSince != nil {
                LiveActivityController.shared.setPublishingHold("paused", queueDepth: self.samples.count)
            }
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
            self.setCurrentModeLocked(mode)
            LiveActivityController.shared.setMode(mode, queueDepth: self.samples.count)
        }
    }

    func applicationDidBecomeActive() {
        workQueue.async { [weak self] in
            guard let self else { return }
            self.evaluateUsageGuardLocked(trigger: "foreground")
            guard self.signInExpired else { return }
            self.signInExpired = false
            self.publishIfPossibleLocked(reason: "foreground", force: true)
            self.publishMotionIfPossibleLocked(reason: "foreground")
            self.publishMysteryCompletionIfPossibleLocked(reason: "foreground")
        }
    }

    private func setCurrentModeLocked(_ mode: String) {
        accrueModeSecondsLocked(until: Date())
        currentMode = mode
        persistUsageLocked()
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
            activeMotionPublishTask?.cancel()
            activeMotionPublishTask = nil
            motionPublishInFlight = false
            scheduledMotionPublishWorkItem?.cancel()
            scheduledMotionPublishWorkItem = nil
            activeMysteryCompletionTask?.cancel()
            activeMysteryCompletionTask = nil
            mysteryCompletionInFlight = false
            scheduledMysteryRetryWorkItem?.cancel()
            scheduledMysteryRetryWorkItem = nil
            clearPendingMotionLocked()
            lastAcknowledgedMotionClassification = nil
            setCurrentModeLocked("off")
            lastEmissionLocation = nil
            lastEmissionAt = nil
            lastBearing = nil
            enteredCloakAt = nil
            emitSessionSummaryLocked(
                reason: "stop",
                suppressedBridgeEvents: suppressedBridgeEvents
            )
            if preserveSamples {
                silentStopDrainActive = !clearCredentials &&
                    !recoveryActive && networkAvailable != false && storageHealthy
                samples = samples.map { sample in
                    var copy = sample
                    copy.publishCurrentLocation = false
                    return copy
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
                    "breadcrumbQueueDepth": breadcrumbQueueDepth,
                    "credentialsCleared": clearCredentials
                ])
                if !clearCredentials {
                    publishIfPossibleLocked(reason: "healthy-live-stop", force: true)
                }
            } else {
                samples.removeAll()
                acknowledgedTrail.removeAll()
                queueRevision += 1
                scheduledPersistWorkItem?.cancel()
                scheduledPersistWorkItem = nil
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
                LiveActivityController.shared.setTripTitle(nil)
                try? fileManager.removeItem(at: configurationURL)
                if !preserveSamples { try? fileManager.removeItem(at: setAsideSamplesURL) }
                signInExpired = false
                pausedSince = nil
                failureAttempts.removeAll()
                consecutiveFailures = 0
                deleteToken()
                acknowledgedTrail.removeAll()
                queueRevision += 1
                clearMysteryCompletionsLocked()
                MysteryProximityService.shared.clearIdentity()
            }
            emit("gps:native-publish:stopped", details: ["queueDepth": samples.count])
            if !clearCredentials {
                publishMysteryCompletionIfPossibleLocked(reason: "live-stop")
            }
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

    func accept(_ location: CLLocation, forcedReason: String? = nil, parked: Bool = false) {
        workQueue.async { [weak self] in
            guard let self, self.configuration != nil, self.currentMode != "off",
                  !self.publishingRevocationHandled else { return }
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
                recordTrail: !parked && self.configuration?.liveTrailEnabled == true,
                publishCurrentLocation: true,
                reason: acceptedReason,
                parked: parked ? true : nil,
                captureTripId: self.sessionCaptureTripId,
                publishingEpoch: self.sessionPublishingEpoch
            )
            if self.samples.isEmpty || (self.isPublishing && self.batchStartedAt == nil) {
                self.batchStartedAt = Date()
            }
            self.samples.append(sample)
            self.queueRevision += 1
            self.sessionCapturedCount += 1
            if self.samples.count > self.maxQueueDepth {
                self.thinOldestSamplesLocked()
            }
            self.lastEmissionLocation = location
            self.lastEmissionAt = now
            self.lastBearing = bearing
            self.persistSamplesThrottledLocked()
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
            let queueLimitReached = self.samples.count >= self.maxBatchSize
            self.publishIfPossibleLocked(
                reason: parked ? "parked" : (queueLimitReached ? "queue-limit" : "sample-accepted"),
                force: parked || queueLimitReached
            )
        }
    }

    private func thinOldestSamplesLocked() {
        let before = samples.count
        let window = min(thinningWindow, samples.count)
        let kept = samples.prefix(window).enumerated().compactMap { index, sample in
            index % 2 == 0 || index == window - 1 ? sample : nil
        }
        samples.replaceSubrange(0..<window, with: kept)
        capacityReached = true
        recoveryActive = true
        let thinned = before - samples.count
        recordUsageLocked { $0.samplesThinned += thinned }
        emit("gps:native-publish:queue-thinned", level: "warn", details: [
            "before": before,
            "after": samples.count
        ])
    }

    func enqueueMysteryCompletion(missionID: String, triggerID: String, debugArrival: Bool) {
        workQueue.async { [weak self] in
            guard let self else { return }
            guard !self.mysteryCompletions.contains(where: { $0.mysteryMissionId == missionID }) else {
                return
            }
            self.mysteryCompletions.append(.init(
                mysteryMissionId: missionID,
                clientTriggerId: triggerID,
                queuedAt: Date().timeIntervalSince1970 * 1_000,
                debugArrival: debugArrival
            ))
            self.persistMysteryCompletionsLocked()
            self.emit("mystery:native:completion-queued", details: [
                "mysteryMissionId": missionID,
                "queueDepth": self.mysteryCompletions.count
            ])
            self.publishMysteryCompletionIfPossibleLocked(reason: "arrival")
        }
    }

    func acceptMotion(classification: String, confidence: String, sampledAt: Date) {
        workQueue.async { [weak self] in
            guard let self else { return }
            guard self.currentMode != "off" else { return }
            guard let configuration = self.configuration else { return }
            guard configuration.movementDetectionEnabled else {
                self.clearPendingMotionLocked()
                return
            }
            let trusted = confidence == "medium" || confidence == "high"
            let included = ["walking", "running", "cycling", "automotive"].contains(classification)
            guard trusted, included else {
                self.clearPendingMotionLocked()
                self.emit("gps:motion-publish:ignored", details: [
                    "classification": classification,
                    "confidence": confidence
                ])
                return
            }
            if self.pendingMotion?.classification == classification {
                self.publishMotionIfPossibleLocked(reason: "classification-repeat")
                return
            }
            if !self.motionPublishInFlight,
               self.lastAcknowledgedMotionClassification == classification {
                self.clearPendingMotionLocked(status: "acknowledged")
                return
            }
            let motion = PendingMotion(
                classification: classification,
                sampledAt: sampledAt.timeIntervalSince1970 * 1_000
            )
            self.pendingMotion = motion
            self.motionPublishStatus = "pending"
            self.motionPublishFailureReason = nil
            self.persistPendingMotionLocked()
            self.emit("gps:motion-publish:pending", details: [
                "classification": classification,
                "sampledAt": motion.sampledAt
            ])
            self.publishMotionIfPossibleLocked(reason: "classification")
        }
    }

    private func publishMotionIfPossibleLocked(reason: String) {
        guard !motionPublishInFlight,
              !signInExpired,
              !publishingRevocationHandled,
              currentMode != "off",
              configuration?.movementDetectionEnabled == true,
              networkAvailable != false,
              let motion = pendingMotion,
              let config = configuration,
              let token = readToken(),
              let baseURL = URL(string: config.endpoint) else { return }
        motionPublishInFlight = true
        motionPublishStatus = "publishing"
        motionPublishFailureReason = nil
        let requestGeneration = generation
        var request = URLRequest(url: baseURL.appendingPathComponent("api/mutation"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15
        var motionArgs: [String: Any] = [
            "token": token,
            "classification": motion.classification,
            "sampledAt": motion.sampledAt
        ]
        if let sessionPublishingEpoch { motionArgs["publishingEpoch"] = sessionPublishingEpoch }
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "path": "currentActivity:travelerApplyMovementDetection",
            "args": motionArgs,
            "format": "json"
        ])
        let backgroundTask = beginBackgroundTask()
        emit("gps:motion-publish:started", details: [
            "classification": motion.classification,
            "reason": reason
        ])
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.workQueue.async {
                guard let self else { return }
                defer { self.endBackgroundTask(backgroundTask) }
                guard requestGeneration == self.generation else { return }
                self.activeMotionPublishTask = nil
                self.motionPublishInFlight = false
                let succeeded = error == nil &&
                    (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } == true &&
                    data.flatMap {
                        (try? JSONSerialization.jsonObject(with: $0) as? [String: Any])?["status"] as? String
                    } == "success"
                if succeeded {
                    self.lastAcknowledgedMotionClassification = motion.classification
                    if self.pendingMotion == motion {
                        self.clearPendingMotionLocked(status: "acknowledged")
                    }
                    self.emit("gps:motion-publish:ack", details: [
                        "classification": motion.classification,
                        "sampledAt": motion.sampledAt
                    ])
                    self.publishMotionIfPossibleLocked(reason: "newer-pending")
                    return
                }
                self.motionPublishStatus = "failed"
                self.motionPublishFailureReason = error == nil ? "server" : "network"
                self.emit("gps:motion-publish:failure", level: "warn", details: [
                    "classification": motion.classification,
                    "failureClass": self.motionPublishFailureReason ?? "unknown"
                ])
                self.scheduleMotionRetryLocked()
            }
        }
        activeMotionPublishTask = task
        task.resume()
    }

    private func scheduleMotionRetryLocked() {
        scheduledMotionPublishWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.scheduledMotionPublishWorkItem = nil
            self?.publishMotionIfPossibleLocked(reason: "retry")
        }
        scheduledMotionPublishWorkItem = item
        workQueue.asyncAfter(deadline: .now() + 30, execute: item)
    }

    private func clearPendingMotionLocked(status: String = "idle") {
        pendingMotion = nil
        scheduledMotionPublishWorkItem?.cancel()
        scheduledMotionPublishWorkItem = nil
        motionPublishStatus = status
        motionPublishFailureReason = nil
        try? fileManager.removeItem(at: pendingMotionURL)
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
        guard !signInExpired else { return }
        evaluateUsageGuardLocked(trigger: "upload")
        guard pausedSince == nil else {
            recoveryActive = true
            return
        }
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
            samples.count >= maxBatchSize ||
            recoveryActive
        guard shouldFlushNow else {
            scheduleBatchFlushLocked(intervalSeconds: config.emissionIntervalSeconds)
            return
        }
        cancelScheduledPublishLocked()
        isPublishing = true
        publishingPhase = recoveryActive ? "syncing" : "healthy"
        let requestGeneration = generation
        let batch = Array(samples.prefix(maxBatchSize))
        let hadQueuedRemainderAtStart = samples.count > batch.count
        batchStartedAt = nil
        let endpoint = baseURL.appendingPathComponent("api/mutation")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let encodedSamples: [[String: Any]] = batch.map(\.uploadPayload)
        var mutationArgs: [String: Any] = [
            "token": token,
            "samples": encodedSamples,
            "includeDebugMysteryMissions": config.includeDebugMysteryMissions
        ]
        if let knownRevision = MysteryProximityService.shared.knownSyncRevision(
            includeDebugAll: config.includeDebugMysteryMissions
        ) {
            mutationArgs["knownMysteryMissionSyncRevision"] = knownRevision
        }
        let requestBody = try? JSONSerialization.data(withJSONObject: [
            "path": "nativeLocationIngest:travelerIngestNativeLocationBatch",
            "args": mutationArgs,
            "format": "json"
        ])
        request.httpBody = requestBody

        let backgroundTask = beginBackgroundTask()
        let requestStartedAt = Date()
        sessionRequestCount += 1
        sessionBatchSampleCount += batch.count
        let isRetry = consecutiveFailures > 0
        recordUsageLocked { bucket in
            bucket.requests += 1
            bucket.samplesSent += batch.count
            bucket.bytesSent += requestBody?.count ?? 0
            if isRetry { bucket.retries += 1 }
        }
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
                let root = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                self.recordUsageLocked { $0.bytesReceived += data?.count ?? 0 }
                guard error == nil,
                      let httpStatus,
                      (200..<300).contains(httpStatus),
                      let root,
                      root["status"] as? String == "success",
                      let value = root["value"] as? [String: Any] else {
                    let errorData = root?["status"] as? String == "error"
                        ? root?["errorData"] as? [String: Any]
                        : nil
                    self.isPublishing = false
                    self.endBackgroundTask(backgroundTask)
                    self.handlePublishFailureLocked(
                        error: error,
                        httpStatus: httpStatus,
                        errorData: errorData,
                        batch: batch
                    )
                    return
                }

                let outcome = IngestOutcome(response: value)
                let delivered = outcome.delivered
                self.failureAttempts.removeAll()
                self.consecutiveFailures = 0
                let deliveredBatchCount = batch.filter { delivered.contains($0.clientSampleId) }.count
                self.recordUsageLocked { bucket in
                    bucket.samplesAcked += deliveredBatchCount
                    bucket.uploads = (bucket.uploads ?? 0) + 1
                }
                self.persistUsageLocked()
                if let mysterySync = value["mysteryMissionSync"] as? [String: Any] {
                    MysteryProximityService.shared.apply(syncObject: mysterySync)
                }
                let acknowledged = batch.filter {
                    outcome.trailAcknowledged.contains($0.clientSampleId) && $0.recordTrail
                }
                self.acknowledgedTrail.append(contentsOf: acknowledged)
                if self.acknowledgedTrail.count > self.recentTrailLimit {
                    self.acknowledgedTrail.removeFirst(self.acknowledgedTrail.count - self.recentTrailLimit)
                }
                let deliveredBreadcrumbs = acknowledged.count
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
                var ackDetails: JSObject = [
                    "acknowledgementLatencyMs": Int(acknowledgementLatencyMs.rounded()),
                    "remainingQueueDepth": self.samples.count
                ]
                if !outcome.historical.isEmpty { ackDetails["historicalCount"] = outcome.historical.count }
                if !outcome.unrecorded.isEmpty { ackDetails["unrecordedCount"] = outcome.unrecorded.count }
                self.emit("gps:native-publish:ack", details: ackDetails)
                if outcome.revokes(sessionEpoch: self.sessionPublishingEpoch) {
                    self.handlePublishingRevokedLocked(
                        source: "server",
                        reason: "trip-changed",
                        currentTripId: outcome.currentTripId,
                        currentEpoch: outcome.currentEpoch
                    )
                }
                if let latest = batch.last(where: {
                    outcome.appliedAsCurrent.contains($0.clientSampleId) && $0.publishCurrentLocation != false
                }), (latest.parked == true) != self.parkedMarkerDelivered {
                    self.parkedMarkerDelivered = latest.parked == true
                    self.emit("gps:native-publish:parked", details: [
                        "state": self.parkedMarkerDelivered ? "sent" : "cleared"
                    ])
                }
                self.evaluateUsageGuardLocked(trigger: "upload-acknowledged")
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

    /// The shared trip changed (another device, or this one): hold capture at once and let the
    /// service stop the session. The queue is kept so the server can classify what is left.
    private func handlePublishingRevokedLocked(
        source: String,
        reason: String,
        currentTripId: String?,
        currentEpoch: Int?
    ) {
        guard !publishingRevocationHandled else { return }
        publishingRevocationHandled = true
        var details: JSObject = [
            "source": source,
            "reason": reason,
            "queueDepth": samples.count,
            "capturing": currentMode != "off"
        ]
        if let currentTripId { details["currentTripId"] = currentTripId }
        if let currentEpoch { details["epoch"] = currentEpoch }
        DispatchQueue.main.async { [weak self] in self?.onPublishingRevoked?(details) }
    }

    private func publishMysteryCompletionIfPossibleLocked(reason: String) {
        guard !mysteryCompletionInFlight,
              !signInExpired,
              let completion = mysteryCompletions.first,
              let config = configuration,
              let token = readToken(),
              let baseURL = URL(string: config.endpoint),
              networkAvailable != false else { return }

        mysteryCompletionInFlight = true
        let requestGeneration = generation
        var request = URLRequest(url: baseURL.appendingPathComponent("api/mutation"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var completionArgs: [String: Any] = [
            "token": token,
            "mysteryMissionId": completion.mysteryMissionId,
            "clientTriggerId": completion.clientTriggerId
        ]
        if completion.debugArrival == true { completionArgs["debugArrival"] = true }
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "path": "mysteryMissions:travelerCompleteMysteryMissionNative",
            "args": completionArgs,
            "format": "json"
        ])
        let backgroundTask = beginBackgroundTask()
        emit("mystery:native:completion-flush", details: [
            "reason": reason,
            "mysteryMissionId": completion.mysteryMissionId,
            "queueDepth": mysteryCompletions.count
        ])
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.workQueue.async {
                guard let self else { return }
                guard requestGeneration == self.generation else {
                    self.endBackgroundTask(backgroundTask)
                    return
                }
                self.activeMysteryCompletionTask = nil
                self.mysteryCompletionInFlight = false
                let root = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                let value = root?["value"] as? [String: Any]
                let outcome = value?["outcome"] as? String
                let terminal = ["completed", "already_completed", "ineligible", "not_found"]
                if error == nil,
                   let http = response as? HTTPURLResponse,
                   (200..<300).contains(http.statusCode),
                   root?["status"] as? String == "success",
                   let outcome,
                   terminal.contains(outcome) {
                    self.mysteryCompletions.removeAll {
                        $0.clientTriggerId == completion.clientTriggerId
                    }
                    self.persistMysteryCompletionsLocked()
                    self.emit("mystery:native:completion-ack", details: [
                        "mysteryMissionId": completion.mysteryMissionId,
                        "outcome": outcome,
                        "queueDepth": self.mysteryCompletions.count
                    ])
                    MysteryProximityService.shared.completionAcknowledged(
                        missionID: completion.mysteryMissionId,
                        outcome: outcome
                    )
                    self.endBackgroundTask(backgroundTask)
                    self.publishMysteryCompletionIfPossibleLocked(reason: "queue-remainder")
                    return
                }

                self.emit("mystery:native:completion-failure", level: "warn", details: [
                    "mysteryMissionId": completion.mysteryMissionId,
                    "failureClass": error == nil ? "server" : "network",
                    "queueDepth": self.mysteryCompletions.count
                ])
                self.endBackgroundTask(backgroundTask)
                self.scheduledMysteryRetryWorkItem?.cancel()
                let item = DispatchWorkItem { [weak self] in
                    self?.scheduledMysteryRetryWorkItem = nil
                    self?.publishMysteryCompletionIfPossibleLocked(reason: "retry")
                }
                self.scheduledMysteryRetryWorkItem = item
                self.workQueue.asyncAfter(deadline: .now() + 30, execute: item)
            }
        }
        activeMysteryCompletionTask = task
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

    private func handlePublishFailureLocked(
        error: Error?,
        httpStatus: Int?,
        errorData: [String: Any]?,
        batch: [PendingSample]
    ) {
        var failureClass = Self.failureClass(error: error, errorCode: errorData?["code"] as? String)
        let rejectedIds = Set(errorData?["clientSampleIds"] as? [String] ?? [])
        let setAside = failureClass == .rejected
            ? samples.filter { rejectedIds.contains($0.clientSampleId) }
            : []
        if failureClass == .rejected, setAside.isEmpty { failureClass = .server }
        let attempt = (failureAttempts[failureClass] ?? 0) + 1
        failureAttempts[failureClass] = attempt
        consecutiveFailures += 1
        recordUsageLocked { bucket in
            switch failureClass {
            case .network: bucket.failures.network += 1
            case .server: bucket.failures.server += 1
            case .rateLimited: bucket.failures.rateLimited += 1
            case .rejected: bucket.failures.rejected += 1
            case .auth: bucket.failures.auth += 1
            }
        }

        var details: JSObject = [
            "queueDepth": samples.count,
            "failureClass": failureClass.rawValue
        ]
        if let httpStatus { details["httpStatus"] = httpStatus }
        if let urlError = error as? URLError {
            details["networkCode"] = urlError.code.rawValue
            details["networkReason"] = Self.safeNetworkReason(urlError.code)
        }
        publishingPhase = failureClass == .network ? "offline" : "retrying"
        recoveryActive = true
        emit("gps:native-publish:failure", level: "warn", details: details)

        switch failureClass {
        case .network:
            let base = networkBackoffSeconds[min(attempt, networkBackoffSeconds.count) - 1]
            scheduleRetryLocked(after: base * Double.random(in: 0.8...1.2), failureClass: failureClass, attempt: attempt)
        case .server:
            let parkedIds = Set(batch.filter { $0.parked == true }.map(\.clientSampleId))
            if !parkedIds.isEmpty {
                samples.removeAll { parkedIds.contains($0.clientSampleId) }
                queueRevision += 1
                persistSamples()
                emit("gps:native-publish:parked", details: ["state": "dropped"])
            }
            if samples.isEmpty {
                settleEmptyQueueLocked()
            } else {
                scheduleRetryLocked(after: min(30 * pow(2, Double(attempt - 1)), 15 * 60), failureClass: failureClass, attempt: attempt)
            }
        case .rateLimited:
            scheduleRetryLocked(after: 60, failureClass: failureClass, attempt: attempt)
        case .rejected:
            samples.removeAll { rejectedIds.contains($0.clientSampleId) }
            queueRevision += 1
            persistSamples()
            let setAsideCount = appendSetAsideSamplesLocked(setAside)
            recordUsageLocked { $0.samplesSetAside += setAsideCount }
            if samples.isEmpty {
                settleEmptyQueueLocked()
            } else {
                publishingPhase = "syncing"
            }
            emit("gps:native-publish:rejected-samples", level: "warn", details: [
                "rejectedCount": setAside.count,
                "setAsideCount": setAsideCount
            ])
            publishIfPossibleLocked(reason: "rejected-retry", force: true)
        case .auth:
            signInExpired = true
            emit("gps:native-publish:auth-expired", level: "warn", details: [
                "queueDepth": samples.count
            ])
        }
        persistUsageLocked()
        if samples.isEmpty {
            LiveActivityController.shared.setPublishingHealthy(queueDepth: 0)
        } else if let publishingHold {
            LiveActivityController.shared.setPublishingHold(publishingHold, queueDepth: samples.count)
        } else {
            LiveActivityController.shared.setRecovering(queueDepth: samples.count)
        }
    }

    private func settleEmptyQueueLocked() {
        publishingPhase = currentMode == "off" ? "idle" : "healthy"
        recoveryActive = false
        silentStopDrainActive = false
    }

    private func scheduleRetryLocked(after delay: TimeInterval, failureClass: FailureClass, attempt: Int) {
        schedulePublishLocked(after: delay, reason: "retry", force: true)
        emit("gps:native-publish:backoff", details: [
            "failureClass": failureClass.rawValue,
            "attempt": attempt,
            "delaySeconds": Int(delay.rounded()),
            "queueDepth": samples.count
        ])
    }

    private static func failureClass(error: Error?, errorCode: String?) -> FailureClass {
        if error != nil { return .network }
        switch errorCode {
        case "not_authenticated": return .auth
        case "invalid_samples": return .rejected
        case "rate_limited": return .rateLimited
        default: return .server
        }
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

    private var publishingHold: String? {
        if signInExpired || configuration == nil { return "sign-in-expired" }
        if pausedSince != nil { return "paused" }
        return nil
    }

    private var reportedPublishingPhase: String {
        guard publishingPhase != "storage-error" else { return publishingPhase }
        if !samples.isEmpty, let publishingHold { return publishingHold }
        if pausedSince != nil, currentMode != "off" { return "paused" }
        return publishingPhase
    }

    private func handleNetworkPath(_ path: NWPath) {
        let wasAvailable = networkAvailable
        networkAvailable = path.status == .satisfied
        if networkAvailable == false {
            cancelScheduledPublishLocked()
            scheduledMotionPublishWorkItem?.cancel()
            scheduledMotionPublishWorkItem = nil
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
        if wasAvailable != true { failureAttempts[.network] = nil }
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
        if wasAvailable != true, pendingMotion != nil {
            publishMotionIfPossibleLocked(reason: "network-restored")
        }
        if wasAvailable != true, !mysteryCompletions.isEmpty {
            publishMysteryCompletionIfPossibleLocked(reason: "network-restored")
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
            "publishingPhase": reportedPublishingPhase,
            "queueDepth": samples.count,
            "breadcrumbQueueDepth": breadcrumbQueueDepth,
            "capacityReached": capacityReached,
            "motionPublishStatus": motionPublishStatus,
            "motionPendingClassification": pendingMotion?.classification ?? NSNull(),
            "motionPublishFailureReason": motionPublishFailureReason ?? NSNull(),
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
    private var pendingMotionURL: URL { applicationSupportURL.appendingPathComponent("pending-motion.json") }
    private var mysteryCompletionsURL: URL { applicationSupportURL.appendingPathComponent("mystery-completions.json") }
    private var setAsideSamplesURL: URL { applicationSupportURL.appendingPathComponent("rejected.json") }
    private var usageHistoryURL: URL { applicationSupportURL.appendingPathComponent("usage-ledger.json") }
    private var usageCurrentURL: URL { applicationSupportURL.appendingPathComponent("usage-ledger-current.json") }

    private func persistSamplesThrottledLocked() {
        if samples.count > persistThrottleQueueDepth,
           let lastSamplesPersistAt,
           Date().timeIntervalSince(lastSamplesPersistAt) < persistThrottleInterval {
            guard scheduledPersistWorkItem == nil else { return }
            let item = DispatchWorkItem { [weak self] in
                self?.scheduledPersistWorkItem = nil
                self?.persistSamples()
            }
            scheduledPersistWorkItem = item
            workQueue.asyncAfter(
                deadline: .now() + persistThrottleInterval - Date().timeIntervalSince(lastSamplesPersistAt),
                execute: item
            )
            return
        }
        persistSamples()
    }

    private func persistSamples() {
        scheduledPersistWorkItem?.cancel()
        scheduledPersistWorkItem = nil
        lastSamplesPersistAt = Date()
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

    private func loadDecoded<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func appendSetAsideSamplesLocked(_ rejected: [PendingSample]) -> Int {
        var stored = loadDecoded([PendingSample].self, from: setAsideSamplesURL) ?? []
        stored.append(contentsOf: rejected)
        if stored.count > maxSetAsideSamples {
            stored.removeFirst(stored.count - maxSetAsideSamples)
        }
        do {
            try persist(stored, to: setAsideSamplesURL)
            return min(rejected.count, maxSetAsideSamples)
        } catch {
            emit("gps:native-publish:persist-failure", level: "warn", details: [
                "failureClass": "storage",
                "target": "set-aside"
            ])
            return 0
        }
    }

    func usageLedger(completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            self.accrueModeSecondsLocked(until: Date())
            self.persistUsageLocked()
            self.evaluateUsageGuardLocked(trigger: "ledger-read")
            let ledger = self.usageLedgerLocked()
            DispatchQueue.main.async { completion(ledger) }
        }
    }

    func resetUsageLedger(completion: @escaping (JSObject) -> Void) {
        workQueue.async { [weak self] in
            guard let self else { return }
            let now = Date()
            self.usageHistory.removeAll()
            self.usageHistoryDirty = false
            self.usageCurrent = UsageBucket(hourStart: Self.hourStart(of: now))
            self.usageModeSince = now
            try? self.fileManager.removeItem(at: self.usageHistoryURL)
            try? self.fileManager.removeItem(at: self.usageCurrentURL)
            self.evaluateUsageGuardLocked(trigger: "reset")
            let ledger = self.usageLedgerLocked()
            DispatchQueue.main.async { completion(ledger) }
        }
    }

    private func usageEstimateLocked() -> (monthKey: String, uploads: Int, bytes: Double) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? calendar.timeZone
        let now = Date()
        let parts = calendar.dateComponents([.year, .month], from: now)
        let month = calendar.dateInterval(of: .month, for: now)
        let startMs = (month?.start.timeIntervalSince1970 ?? 0) * 1_000
        let endMs = (month?.end.timeIntervalSince1970 ?? 0) * 1_000
        let uploads = (usageHistory + [usageCurrent])
            .filter { $0.hourStart >= startMs && $0.hourStart < endMs }
            .reduce(0) { $0 + ($1.uploads ?? 0) }
        return (
            String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0),
            uploads,
            Double(uploads) * (configuration?.usageGuard?.bytesPerUpload ?? 0)
        )
    }

    private func evaluateUsageGuardLocked(trigger: String) {
        guard let usageGuard = configuration?.usageGuard else {
            if pausedSince != nil { leaveUsagePauseLocked(trigger: trigger) }
            return
        }
        let estimate = usageEstimateLocked()
        let exceeded = estimate.bytes >= usageGuard.monthlyLimitBytes * usageGuard.pausePercent / 100
        if exceeded, pausedSince == nil {
            pausedSince = Date()
            cancelScheduledPublishLocked()
            emit("gps:native-publish:paused", level: "warn", details: [
                "trigger": trigger,
                "monthUploads": estimate.uploads,
                "queueDepth": samples.count
            ])
            LiveActivityController.shared.setPublishingHold("paused", queueDepth: samples.count)
        } else if !exceeded, pausedSince != nil {
            leaveUsagePauseLocked(trigger: trigger)
        }
    }

    private func leaveUsagePauseLocked(trigger: String) {
        guard let pausedSince else { return }
        self.pausedSince = nil
        emit("gps:native-publish:resumed", details: [
            "trigger": trigger,
            "pausedForSeconds": Int(Date().timeIntervalSince(pausedSince).rounded()),
            "queueDepth": samples.count
        ])
        LiveActivityController.shared.setPublishingHealthy(queueDepth: samples.count)
        workQueue.async { [weak self] in
            self?.publishIfPossibleLocked(reason: "usage-resumed", force: true)
        }
    }

    private func usageLedgerLocked() -> JSObject {
        let estimate = usageEstimateLocked()
        return [
            "estimate": [
                "monthKey": estimate.monthKey,
                "uploads": estimate.uploads,
                "bytes": estimate.bytes,
                "limitBytes": configuration?.usageGuard?.monthlyLimitBytes ?? NSNull(),
                "paused": pausedSince != nil
            ] as JSObject,
            "buckets": (usageHistory + [usageCurrent]).map { $0.jsObject as JSValue },
            "policy": [
                "emissionIntervalSeconds": configuration?.emissionIntervalSeconds ?? NSNull(),
                "maxBatchSize": maxBatchSize,
                "maxQueueDepth": maxQueueDepth,
                "minEmissionIntervalSeconds": minEmissionInterval,
                "heartbeatIntervalSeconds": heartbeatInterval,
                "minDistanceMeters": minDistanceMeters,
                "minBearingDistanceMeters": minBearingDistanceMeters,
                "turnThresholdDegrees": turnThresholdDegrees
            ] as JSObject
        ]
    }

    private func recordUsageLocked(_ update: (inout UsageBucket) -> Void) {
        accrueModeSecondsLocked(until: Date())
        update(&usageCurrent)
    }

    private func accrueModeSecondsLocked(until now: Date) {
        if currentMode != "off", let since = usageModeSince {
            var cursor = max(since, now.addingTimeInterval(-maxModeAccrualGap))
            while cursor < now {
                selectUsageBucketLocked(at: cursor)
                let hourEnd = Date(timeIntervalSince1970: (Self.hourStart(of: cursor) + 3_600_000) / 1_000)
                let end = min(hourEnd, now)
                usageCurrent.secondsByMode[currentMode, default: 0] += end.timeIntervalSince(cursor)
                cursor = end
            }
        }
        usageModeSince = now
        selectUsageBucketLocked(at: now)
    }

    private func selectUsageBucketLocked(at date: Date) {
        let hour = Self.hourStart(of: date)
        guard hour != usageCurrent.hourStart else { return }
        if usageCurrent.hasActivity {
            usageHistory.append(usageCurrent)
            usageHistory.sort { $0.hourStart < $1.hourStart }
        }
        if let index = usageHistory.firstIndex(where: { $0.hourStart == hour }) {
            usageCurrent = usageHistory.remove(at: index)
        } else {
            usageCurrent = UsageBucket(hourStart: hour)
        }
        if usageHistory.count >= maxUsageBuckets {
            usageHistory.removeFirst(usageHistory.count - maxUsageBuckets + 1)
        }
        usageHistoryDirty = true
    }

    private func persistUsageLocked() {
        if usageHistoryDirty, (try? persist(usageHistory, to: usageHistoryURL)) != nil {
            usageHistoryDirty = false
        }
        try? persist(usageCurrent, to: usageCurrentURL)
    }

    private static func hourStart(of date: Date) -> Double {
        (date.timeIntervalSince1970 / 3_600).rounded(.down) * 3_600_000
    }

    private func persistPendingMotionLocked() {
        guard let pendingMotion else {
            try? fileManager.removeItem(at: pendingMotionURL)
            return
        }
        do {
            try persist(pendingMotion, to: pendingMotionURL)
        } catch {
            motionPublishStatus = "failed"
            motionPublishFailureReason = "storage"
            emit("gps:motion-publish:failure", level: "warn", details: [
                "classification": pendingMotion.classification,
                "failureClass": "storage"
            ])
        }
    }

    private func loadPendingMotion() -> PendingMotion? {
        guard let data = try? Data(contentsOf: pendingMotionURL) else { return nil }
        return try? JSONDecoder().decode(PendingMotion.self, from: data)
    }

    private func persistMysteryCompletionsLocked() {
        do {
            try persist(mysteryCompletions, to: mysteryCompletionsURL)
        } catch {
            emit("mystery:native:completion-persist-failure", level: "warn", details: [
                "failureClass": "storage",
                "queueDepth": mysteryCompletions.count
            ])
        }
    }

    private func loadMysteryCompletions() -> [PendingMysteryCompletion] {
        guard let data = try? Data(contentsOf: mysteryCompletionsURL) else { return [] }
        return (try? JSONDecoder().decode([PendingMysteryCompletion].self, from: data)) ?? []
    }

    private func clearMysteryCompletionsLocked() {
        mysteryCompletions.removeAll()
        try? fileManager.removeItem(at: mysteryCompletionsURL)
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
