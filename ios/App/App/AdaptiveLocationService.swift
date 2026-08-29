import CoreLocation
import CoreMotion
import Foundation
import Capacitor
import UIKit

final class AdaptiveLocationService: NSObject, CLLocationManagerDelegate {
    static let shared = AdaptiveLocationService()

    private final class StartOperation {
        let id = UUID().uuidString.lowercased()
        let trigger: String
        let startedAt = Date()
        let retryCount: Int
        var captureFinished = false
        var activityFinished = false
        var completions: [(JSObject) -> Void] = []
        var watchdog: DispatchWorkItem?

        init(trigger: String, retryCount: Int, completion: ((JSObject) -> Void)?) {
            self.trigger = trigger
            self.retryCount = retryCount
            if let completion { completions.append(completion) }
        }
    }

    enum Mode: String {
        case off
        case precise
        case powerSaving = "power-saving"
    }

    private enum DefaultsKey {
        static let liveRequested = "tripcast.adaptiveLocation.liveRequested"
        static let mode = "tripcast.adaptiveLocation.mode"
        static let anchorLatitude = "tripcast.adaptiveLocation.anchorLatitude"
        static let anchorLongitude = "tripcast.adaptiveLocation.anchorLongitude"
        static let anchorAccuracy = "tripcast.adaptiveLocation.anchorAccuracy"
        static let anchorTimestamp = "tripcast.adaptiveLocation.anchorTimestamp"
        static let lastMeaningfulAt = "tripcast.adaptiveLocation.lastMeaningfulAt"
        static let modeChangedAt = "tripcast.adaptiveLocation.modeChangedAt"
        static let modeChangedReason = "tripcast.adaptiveLocation.modeChangedReason"
    }

    private let manager = CLLocationManager()
    private let motionManager = CMMotionActivityManager()
    private let motionQueue = OperationQueue.main
    private let defaults = UserDefaults.standard
    private let stationaryInterval: TimeInterval = 5 * 60
    private let movementDistance: CLLocationDistance = 50
    private let preciseDistanceFilter: CLLocationDistance = 10
    private let walkingSpeed: CLLocationSpeed = 0.9
    private let wakeRegionRadius: CLLocationDistance = 100
    private let wakeRegionIdentifier = "tripcast-adaptive-stationary"
    private let mainThreadHeartbeat = MainThreadHeartbeat()

    private(set) var mode: Mode = .off
    private(set) var liveRequested = false
    private var highFrequencyActive = false
    private var stationaryAnchor: CLLocation?
    private var lastPreciseFix: CLLocation?
    private var lastMeaningfulAt: Date?
    private var modeChangedAt = Date.distantPast
    private var modeChangedReason = "initialized"
    private var stationaryTimer: Timer?
    private var waitingForFreshPreciseFix = false
    private var freshFixAcquisitionBeganAt: Date?
    private var forcedPublishReason: String?
    private var standardUpdatesRunning = false
    private var motionUpdatesRunning = false
    private var motionState = "unknown"
    private var motionConfidence = "unknown"
    private var motionChangedAt = Date.distantPast
    private var isApplicationForeground = UIApplication.shared.applicationState == .active
    private var suppressedBridgeEventCount = 0
    private var startRetryCount = 0
    private var cachedPublishingState: JSObject = [
        "publishingPhase": "idle",
        "queueDepth": 0,
        "breadcrumbQueueDepth": 0,
        "capacityReached": false,
        "configurationReady": false,
        "durableStorageReady": true,
        "activityStatus": "idle",
        "queueRevision": 0
    ]
    private var captureFailureReason: String?
    private var startOperation: StartOperation?
    private var lastStartCompletedAt: Date?

    var eventHandler: ((JSObject) -> Void)? {
        didSet { deliverPendingEventIfNeeded() }
    }
    private var pendingEvent: JSObject?
    private var pendingHangSummary: JSObject?

    private override init() {
        super.init()
        pendingHangSummary = mainThreadHeartbeat.consumePreviousHangSummary()
        mainThreadHeartbeat.setActive(isApplicationForeground)
        manager.delegate = self
        NativeLocationPublisher.shared.eventHandler = { [weak self] event in
            guard let self else { return }
            self.mergePublishingState(event)
            var merged = self.currentState()
            for (key, value) in event { merged[key] = value }
            self.emit(merged)
        }
        LiveActivityController.shared.eventHandler = { [weak self] event in
            guard let self else { return }
            var merged = self.currentState()
            for (key, value) in event { merged[key] = value }
            self.emit(merged)
        }
        NativeLocationPublisher.shared.onCloakTimeout = { [weak self] in
            NativeLocationPublisher.shared.stopRemoteSharing()
            self?.stopLive()
        }
        NativeLocationPublisher.shared.currentPublishingState { [weak self] state in
            self?.mergePublishingState(state)
        }
    }

    func bootstrapLocationRelaunch() {
        guard defaults.bool(forKey: DefaultsKey.liveRequested) else {
            LiveActivityController.shared.stop()
            return
        }
        restorePersistedState()
        coordinateStart(trigger: "restored", completion: nil)
    }

    func startLive(trigger: String = "explicit", completion: @escaping (JSObject) -> Void) {
        coordinateStart(trigger: trigger, completion: completion)
    }

    private func coordinateStart(trigger: String, completion: ((JSObject) -> Void)?) {
        if let operation = startOperation {
            if let completion { operation.completions.append(completion) }
            emitOperationLog(operation, stage: "coalesced", timeout: false)
            return
        }
        if trigger != "retry",
           liveRequested,
           let lastStartCompletedAt,
           Date().timeIntervalSince(lastStartCompletedAt) < 2,
           currentState()["captureReadiness"] as? String == "ready" {
            NativeLocationPublisher.shared.setMode(mode.rawValue)
            completion?(currentState())
            return
        }
        let wasAlreadyRequested = liveRequested || defaults.bool(forKey: DefaultsKey.liveRequested)
        if wasAlreadyRequested { startRetryCount += 1 } else { startRetryCount = 0 }
        let operation = StartOperation(trigger: trigger, retryCount: startRetryCount, completion: completion)
        startOperation = operation
        emitOperationLog(operation, stage: "requested", timeout: false)
        liveRequested = true
        MysteryProximityService.shared.setLiveActive(true)
        defaults.set(true, forKey: DefaultsKey.liveRequested)
        requestAuthorization()
        startMotionUpdates()
        if trigger == "restored", mode == .powerSaving, stationaryAnchor != nil {
            configurePowerSavingManager()
        } else {
            enterPreciseMode(resetIdleWindow: trigger != "restored", reason: trigger)
        }

        NativeLocationPublisher.shared.startLive(mode: mode.rawValue) { [weak self] state in
            guard let self else { return }
            self.mergePublishingState(state)
            self.publishCurrentMotion()
            self.finishStartStage(operationID: operation.id, capability: "capture")
        }
        LiveActivityController.shared.start(mode: mode.rawValue, queueDepth: cachedQueueDepth) { [weak self] outcome in
            guard let self else { return }
            self.cachedPublishingState["activityStatus"] = outcome
            self.emit([
                "action": "gps:live-activity:\(outcome)",
                "level": outcome == "failed" ? "warn" : "info",
                "details": ["operationId": operation.id, "trigger": trigger]
            ])
            self.finishStartStage(operationID: operation.id, capability: "activity")
        }
        let watchdog = DispatchWorkItem { [weak self] in
            self?.finishStartWatchdog(operationID: operation.id)
        }
        operation.watchdog = watchdog
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: watchdog)
    }

    func stopLive(
        clearCredentials: Bool = false,
        preserveSamples: Bool = false,
        completion: ((JSObject) -> Void)? = nil
    ) {
        emit([
            "action": "gps:adaptive:stop:requested",
            "details": [
                "preserveSamples": preserveSamples,
                "clearCredentials": clearCredentials
            ]
        ])
        liveRequested = false
        MysteryProximityService.shared.setLiveActive(false)
        highFrequencyActive = false
        stationaryTimer?.invalidate()
        stationaryTimer = nil
        stopAllLocationServices()
        stopMotionUpdates()
        stationaryAnchor = nil
        lastPreciseFix = nil
        lastMeaningfulAt = nil
        waitingForFreshPreciseFix = false
        freshFixAcquisitionBeganAt = nil
        forcedPublishReason = nil
        mode = .off
        modeChangedAt = Date()
        modeChangedReason = "live-stop"
        cancelStartOperation(reason: "stopped")
        clearPersistedTrackingState()
        let suppressedEvents = suppressedBridgeEventCount
        suppressedBridgeEventCount = 0
        let stopGroup = DispatchGroup()
        var stoppedPublishingState: JSObject?
        var activityStopResult: LiveActivityStopResult?
        stopGroup.enter()
        LiveActivityController.shared.stop { result in
            activityStopResult = result
            stopGroup.leave()
        }
        stopGroup.enter()
        NativeLocationPublisher.shared.stopLive(
            clearCredentials: clearCredentials,
            preserveSamples: preserveSamples,
            suppressedBridgeEvents: suppressedEvents
        ) { state in
            stoppedPublishingState = state
            stopGroup.leave()
        }
        stopGroup.notify(queue: .main) { [weak self] in
            guard let self else { return }
            if let stoppedPublishingState {
                self.mergePublishingState(stoppedPublishingState)
            }
            let result = self.currentState()
            self.emit([
                "action": "gps:adaptive:stop:completed",
                "details": [
                    "preserveSamples": preserveSamples,
                    "activityCount": activityStopResult?.requestedCount ?? 0,
                    "remainingActivityCount": activityStopResult?.remainingCount ?? 0
                ]
            ])
            self.emit(result)
            completion?(result)
        }
    }

    func currentState() -> JSObject {
        var state: JSObject = [
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": modeChangedReason,
            "motionState": motionState,
            "motionConfidence": motionConfidence
        ]
        if motionChangedAt != Date.distantPast {
            state["motionChangedAt"] = motionChangedAt.timeIntervalSince1970 * 1_000
        }
        let publishingState = cachedPublishingState
        for (key, value) in publishingState { state[key] = value }
        if !liveRequested {
            state["captureReadiness"] = "idle"
        } else if manager.authorizationStatus == .notDetermined {
            state["captureReadiness"] = "starting"
        } else if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            state["captureReadiness"] = "degraded"
            state["failureReason"] = "location-permission-denied"
        } else if manager.authorizationStatus == .authorizedWhenInUse {
            state["captureReadiness"] = "degraded"
            state["failureReason"] = "always-location-permission-required"
        } else if let captureFailureReason {
            state["captureReadiness"] = "degraded"
            state["failureReason"] = captureFailureReason
        } else if publishingState["configurationReady"] as? Bool != true {
            state["captureReadiness"] = "degraded"
            state["failureReason"] = publishingState["failureReason"] as? String ?? "configuration-missing"
        } else if publishingState["durableStorageReady"] as? Bool != true {
            state["captureReadiness"] = "degraded"
            state["failureReason"] = publishingState["failureReason"] as? String ?? "queue-storage-unavailable"
        } else {
            state["captureReadiness"] = "ready"
            state.removeValue(forKey: "failureReason")
        }
        return state
    }

    func setHighFrequencyActive(_ active: Bool) {
        highFrequencyActive = active
        guard liveRequested else { return }
        if active {
            if mode == .powerSaving {
                enterPreciseMode(resetIdleWindow: true, reason: "high-frequency-start")
            } else {
                waitingForFreshPreciseFix = true
                freshFixAcquisitionBeganAt = Date()
                forcedPublishReason = "force"
                configurePreciseManager(acquiringFreshFix: true)
                manager.distanceFilter = kCLDistanceFilterNone
                scheduleStationaryTimer()
            }
        } else if mode == .precise {
            configurePreciseManager(acquiringFreshFix: waitingForFreshPreciseFix)
            scheduleStationaryTimer()
        }
    }

    func applicationDidBecomeActive(completion: ((JSObject) -> Void)? = nil) {
        isApplicationForeground = true
        mainThreadHeartbeat.setActive(true)
        let suppressedEvents = suppressedBridgeEventCount
        suppressedBridgeEventCount = 0
        if liveRequested || defaults.bool(forKey: DefaultsKey.liveRequested) {
            NativeLocationPublisher.shared.emitSessionSummary(
                reason: "foreground",
                suppressedBridgeEvents: suppressedEvents
            )
        }
        if !liveRequested, defaults.bool(forKey: DefaultsKey.liveRequested) {
            restorePersistedState()
            coordinateStart(trigger: "foreground-restored", completion: completion)
            return
        }
        guard liveRequested else {
            LiveActivityController.shared.stop()
            completion?(currentState())
            return
        }
        coordinateStart(trigger: "foreground", completion: completion)
    }

    func applicationDidEnterBackground() {
        isApplicationForeground = false
        mainThreadHeartbeat.setActive(false)
    }

    private func restorePersistedState() {
        liveRequested = true
        mode = Mode(rawValue: defaults.string(forKey: DefaultsKey.mode) ?? "") ?? .precise
        modeChangedAt = date(forKey: DefaultsKey.modeChangedAt) ?? Date()
        modeChangedReason = defaults.string(forKey: DefaultsKey.modeChangedReason) ?? "location-relaunch"
        lastMeaningfulAt = date(forKey: DefaultsKey.lastMeaningfulAt) ?? Date()
        stationaryAnchor = persistedAnchor()
    }

    func configurePublishing(
        endpoint: String,
        token: String,
        liveTrailEnabled: Bool,
        movementDetectionEnabled: Bool,
        emissionIntervalSeconds: Int,
        alertThresholdSeconds: TimeInterval,
        cloakTimeoutSeconds: TimeInterval,
        cloakZones: [NativeLocationPublisher.CloakZone],
        includeDebugMysteryMissions: Bool,
        completion: @escaping (Result<JSObject, Error>) -> Void
    ) {
        LiveActivityController.shared.configure(alertThresholdSeconds: alertThresholdSeconds)
        NativeLocationPublisher.shared.configure(
            endpoint: endpoint,
            token: token,
            liveTrailEnabled: liveTrailEnabled,
            movementDetectionEnabled: movementDetectionEnabled,
            emissionIntervalSeconds: emissionIntervalSeconds,
            alertThresholdSeconds: alertThresholdSeconds,
            cloakTimeoutSeconds: cloakTimeoutSeconds,
            cloakZones: cloakZones,
            includeDebugMysteryMissions: includeDebugMysteryMissions
        ) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let state):
                self.mergePublishingState(state)
                self.captureFailureReason = nil
                self.publishCurrentMotion()
                completion(.success(self.currentState()))
            case .failure(let error):
                self.captureFailureReason = "configuration-failed"
                completion(.failure(error))
            }
        }
    }

    func bootstrapPublishingState(completion: @escaping (JSObject) -> Void) {
        NativeLocationPublisher.shared.currentPublishingState { [weak self] state in
            guard let self else { return }
            self.mergePublishingState(state)
            completion(self.currentState())
        }
    }

    func beginLegacyBootstrapPublishing(completion: @escaping (JSObject) -> Void) {
        NativeLocationPublisher.shared.startLive(mode: "legacy") { [weak self] state in
            guard let self else { return }
            self.mergePublishingState(state)
            completion(self.currentState())
        }
    }

    func acceptLegacyBootstrapFix(_ location: CLLocation) {
        NativeLocationPublisher.shared.accept(location)
    }

    func localTrailSnapshot(completion: @escaping (JSObject) -> Void) {
        NativeLocationPublisher.shared.localTrailSnapshot(completion: completion)
    }

    private var cachedQueueDepth: Int {
        cachedPublishingState["queueDepth"] as? Int ?? 0
    }

    private func mergePublishingState(_ state: JSObject) {
        let keys = [
            "publishingPhase", "queueDepth", "breadcrumbQueueDepth", "capacityReached",
            "configurationReady", "durableStorageReady", "activityStatus", "queueRevision",
            "failureReason", "completedDrainCount", "motionPublishStatus",
            "motionPendingClassification", "motionPublishFailureReason"
        ]
        for key in keys where state[key] != nil {
            cachedPublishingState[key] = state[key]
        }
        if state["failureReason"] == nil,
           state["configurationReady"] as? Bool == true,
           state["durableStorageReady"] as? Bool == true {
            cachedPublishingState.removeValue(forKey: "failureReason")
        }
    }

    private func finishStartStage(operationID: String, capability: String) {
        guard let operation = startOperation, operation.id == operationID else {
            if capability == "capture" { captureFailureReason = nil }
            emit([
                "action": "gps:adaptive:start-late-recovery",
                "details": ["operationId": operationID, "capability": capability]
            ])
            emitState()
            return
        }
        if capability == "capture" {
            operation.captureFinished = true
            captureFailureReason = nil
        } else {
            operation.activityFinished = true
        }
        emitOperationLog(operation, stage: "\(capability)-complete", timeout: false)
        if operation.captureFinished && operation.activityFinished {
            completeStartOperation(operation, timeout: false)
        }
    }

    private func finishStartWatchdog(operationID: String) {
        guard let operation = startOperation, operation.id == operationID else { return }
        if !operation.captureFinished { captureFailureReason = "native-start-timeout" }
        if !operation.activityFinished { cachedPublishingState["activityStatus"] = "failed" }
        completeStartOperation(operation, timeout: true)
    }

    private func completeStartOperation(_ operation: StartOperation, timeout: Bool) {
        guard startOperation?.id == operation.id else { return }
        operation.watchdog?.cancel()
        startOperation = nil
        lastStartCompletedAt = Date()
        let state = currentState()
        emitOperationLog(operation, stage: "result", timeout: timeout)
        emit(state)
        operation.completions.forEach { $0(state) }
    }

    private func cancelStartOperation(reason: String) {
        guard let operation = startOperation else { return }
        operation.watchdog?.cancel()
        startOperation = nil
        emitOperationLog(operation, stage: reason, timeout: false)
        let state = currentState()
        operation.completions.forEach { $0(state) }
    }

    private func emitOperationLog(_ operation: StartOperation, stage: String, timeout: Bool) {
        let state = currentState()
        emit([
            "action": stage == "result" ? "gps:adaptive:start-result" : "gps:adaptive:start-progress",
            "level": timeout ? "warn" : "info",
            "details": [
                "operationId": operation.id,
                "trigger": operation.trigger,
                "stage": stage,
                "durationMs": Int(Date().timeIntervalSince(operation.startedAt) * 1_000),
                "retryCount": operation.retryCount,
                "timeout": timeout,
                "captureResult": state["captureReadiness"] as? String ?? "degraded",
                "activityOutcome": state["activityStatus"] as? String ?? "unsupported"
            ]
        ])
    }

    private func requestAuthorization() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestAlwaysAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
        case .denied, .restricted:
            LiveActivityController.shared.setLocationAcquisitionFailed()
        default:
            break
        }
    }

    private func startMotionUpdates() {
        guard CMMotionActivityManager.isActivityAvailable() else {
            updateMotion(state: "unknown", confidence: "unavailable", at: Date(), source: "availability")
            return
        }
        if !motionUpdatesRunning {
            motionUpdatesRunning = true
            motionManager.startActivityUpdates(to: motionQueue) { [weak self] activity in
                guard let self, let activity else { return }
                self.handleMotionActivity(activity, source: "live")
            }
        }
        let now = Date()
        motionManager.queryActivityStarting(
            from: now.addingTimeInterval(-15 * 60),
            to: now,
            to: motionQueue
        ) { [weak self] activities, _ in
            guard let self, let activity = activities?.last else { return }
            self.handleMotionActivity(activity, source: "history")
        }
    }

    private func stopMotionUpdates() {
        guard motionUpdatesRunning else { return }
        motionManager.stopActivityUpdates()
        motionUpdatesRunning = false
        motionState = "unknown"
        motionConfidence = "unknown"
        motionChangedAt = Date()
        LiveActivityController.shared.setMotion(
            state: motionState,
            confidence: motionConfidence,
            startedAt: motionChangedAt
        )
    }

    private func handleMotionActivity(_ activity: CMMotionActivity, source: String) {
        guard liveRequested, activity.startDate >= motionChangedAt else { return }
        let confidence: String
        switch activity.confidence {
        case .high: confidence = "high"
        case .medium: confidence = "medium"
        case .low: confidence = "low"
        @unknown default: confidence = "unknown"
        }

        let state: String
        if activity.automotive {
            state = "automotive"
        } else if activity.cycling {
            state = "cycling"
        } else if activity.running {
            state = "running"
        } else if activity.walking {
            state = "walking"
        } else if activity.stationary {
            state = "stationary"
        } else {
            state = "unknown"
        }
        updateMotion(state: state, confidence: confidence, at: activity.startDate, source: source)

        let trustedMoving = confidence != "low" && confidence != "unknown" &&
            state != "stationary" && state != "unknown"
        if trustedMoving, mode == .powerSaving {
            promoteFromPowerSaving(reason: "motion-\(state)")
        }
    }

    private func updateMotion(state: String, confidence: String, at date: Date, source: String) {
        motionState = state
        motionConfidence = confidence
        motionChangedAt = date
        LiveActivityController.shared.setMotion(state: state, confidence: confidence, startedAt: date)
        publishCurrentMotion()
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": modeChangedReason,
            "action": "gps:motion:classified",
            "details": [
                "state": state,
                "confidence": confidence,
                "source": source,
                "motionChangedAt": date.timeIntervalSince1970 * 1_000
            ]
        ])
    }

    private func publishCurrentMotion() {
        guard motionChangedAt != Date.distantPast else { return }
        NativeLocationPublisher.shared.acceptMotion(
            classification: motionState,
            confidence: motionConfidence,
            sampledAt: motionChangedAt
        )
    }

    private func enterPreciseMode(resetIdleWindow: Bool, reason: String) {
        stopLowPowerMonitors()
        mode = .precise
        modeChangedAt = Date()
        modeChangedReason = reason
        waitingForFreshPreciseFix = true
        freshFixAcquisitionBeganAt = Date()
        forcedPublishReason = reason == "foreground" ? "foreground" :
            (reason == "location-relaunch" || reason == "region-exit" ? "recovery" : "force")
        if resetIdleWindow || lastMeaningfulAt == nil {
            lastMeaningfulAt = Date()
        }
        configurePreciseManager(acquiringFreshFix: true)
        ensureStandardUpdatesRunning()
        persistState()
        scheduleStationaryTimer()
        NativeLocationPublisher.shared.setMode(mode.rawValue)
        emitState()
    }

    private func configurePreciseManager(acquiringFreshFix: Bool = false) {
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        if highFrequencyActive || acquiringFreshFix {
            manager.distanceFilter = kCLDistanceFilterNone
        } else {
            manager.distanceFilter = preciseDistanceFilter
        }
        manager.activityType = .fitness
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = false
        manager.pausesLocationUpdatesAutomatically = true
    }

    private func enterPowerSavingMode(anchor: CLLocation?, reason: String) {
        guard liveRequested, !highFrequencyActive, mode == .precise else { return }
        stationaryTimer?.invalidate()
        stationaryTimer = nil
        if let anchor { stationaryAnchor = anchor }
        if stationaryAnchor == nil { stationaryAnchor = lastPreciseFix }
        guard stationaryAnchor != nil else {
            scheduleStationaryTimer()
            return
        }

        mode = .powerSaving
        modeChangedAt = Date()
        modeChangedReason = reason
        waitingForFreshPreciseFix = false
        freshFixAcquisitionBeganAt = nil
        forcedPublishReason = nil
        configurePowerSavingManager()
        persistState()
        NativeLocationPublisher.shared.setMode(mode.rawValue)
        emitState()
    }

    private func configurePowerSavingManager() {
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        manager.activityType = .fitness
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = false
        manager.pausesLocationUpdatesAutomatically = true
        manager.stopUpdatingLocation()
        standardUpdatesRunning = false
        manager.startMonitoringSignificantLocationChanges()
        if let anchor = stationaryAnchor, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) {
            manager.stopMonitoring(for: CLCircularRegion(
                center: anchor.coordinate,
                radius: wakeRegionRadius,
                identifier: wakeRegionIdentifier
            ))
            let region = CLCircularRegion(
                center: anchor.coordinate,
                radius: wakeRegionRadius,
                identifier: wakeRegionIdentifier
            )
            region.notifyOnEntry = false
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
        }
    }

    private func promoteFromPowerSaving(reason: String) {
        guard liveRequested, mode == .powerSaving else { return }
        enterPreciseMode(resetIdleWindow: true, reason: reason)
    }

    private func ensureStandardUpdatesRunning() {
        guard !standardUpdatesRunning else { return }
        manager.startUpdatingLocation()
        standardUpdatesRunning = true
    }

    private func scheduleStationaryTimer() {
        stationaryTimer?.invalidate()
        guard liveRequested, mode == .precise, !highFrequencyActive else { return }
        let meaningfulAt = lastMeaningfulAt ?? Date()
        let remaining = max(0.1, stationaryInterval - Date().timeIntervalSince(meaningfulAt))
        stationaryTimer = Timer.scheduledTimer(withTimeInterval: remaining, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.enterPowerSavingMode(anchor: self.lastPreciseFix, reason: "stationary-timeout")
        }
    }

    private func isMeaningfulMovement(_ location: CLLocation) -> Bool {
        if location.speed >= walkingSpeed { return true }
        guard let previous = stationaryAnchor ?? lastPreciseFix else { return true }
        let rawDistance = location.distance(from: previous)
        let adjustedDistance = rawDistance
            - max(0, location.horizontalAccuracy)
            - max(0, previous.horizontalAccuracy)
        return adjustedDistance >= movementDistance
    }

    private func stopLowPowerMonitors() {
        manager.stopMonitoringSignificantLocationChanges()
        for region in manager.monitoredRegions where region.identifier == wakeRegionIdentifier {
            manager.stopMonitoring(for: region)
        }
    }

    private func stopAllLocationServices() {
        manager.stopUpdatingLocation()
        standardUpdatesRunning = false
        stopLowPowerMonitors()
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
        emit([
            "action": "gps:adaptive:location-services-stopped",
            "details": [
                "standardUpdatesStopped": true,
                "significantLocationChangesStopped": true,
                "wakeRegionsRemoved": manager.monitoredRegions.filter {
                    $0.identifier == wakeRegionIdentifier
                }.isEmpty,
                "allowsBackgroundLocationUpdates": manager.allowsBackgroundLocationUpdates,
                "showsBackgroundLocationIndicator": manager.showsBackgroundLocationIndicator,
                "backgroundActivitySession": "unused"
            ]
        ])
    }

    private func emitLocation(_ location: CLLocation) {
        var event = currentState()
        event["lat"] = location.coordinate.latitude
        event["lon"] = location.coordinate.longitude
        event["accuracy"] = location.horizontalAccuracy
        if location.speed >= 0 { event["speed"] = location.speed }
        event["timestamp"] = location.timestamp.timeIntervalSince1970 * 1_000
        emit(event)
    }

    private func emitState() {
        emit(currentState())
    }

    private func emit(_ event: JSObject) {
        guard isApplicationForeground else {
            suppressedBridgeEventCount += 1
            return
        }
        if let eventHandler {
            eventHandler(event)
        } else {
            pendingEvent = event
        }
    }

    private func deliverPendingEventIfNeeded() {
        guard let eventHandler else { return }
        if let pendingHangSummary {
            self.pendingHangSummary = nil
            eventHandler([
                "action": "gps:native-main-thread:previous-stall",
                "level": "warn",
                "details": pendingHangSummary
            ])
        }
        if let pendingEvent {
            self.pendingEvent = nil
            eventHandler(pendingEvent)
        }
    }

    private func persistState() {
        defaults.set(liveRequested, forKey: DefaultsKey.liveRequested)
        defaults.set(mode.rawValue, forKey: DefaultsKey.mode)
        defaults.set(modeChangedAt.timeIntervalSince1970, forKey: DefaultsKey.modeChangedAt)
        defaults.set(modeChangedReason, forKey: DefaultsKey.modeChangedReason)
        if let lastMeaningfulAt {
            defaults.set(lastMeaningfulAt.timeIntervalSince1970, forKey: DefaultsKey.lastMeaningfulAt)
        }
        if let anchor = stationaryAnchor {
            defaults.set(anchor.coordinate.latitude, forKey: DefaultsKey.anchorLatitude)
            defaults.set(anchor.coordinate.longitude, forKey: DefaultsKey.anchorLongitude)
            defaults.set(anchor.horizontalAccuracy, forKey: DefaultsKey.anchorAccuracy)
            defaults.set(anchor.timestamp.timeIntervalSince1970, forKey: DefaultsKey.anchorTimestamp)
        }
    }

    private func clearPersistedTrackingState() {
        let keys = [
            DefaultsKey.liveRequested,
            DefaultsKey.mode,
            DefaultsKey.anchorLatitude,
            DefaultsKey.anchorLongitude,
            DefaultsKey.anchorAccuracy,
            DefaultsKey.anchorTimestamp,
            DefaultsKey.lastMeaningfulAt,
            DefaultsKey.modeChangedAt,
            DefaultsKey.modeChangedReason
        ]
        keys.forEach { defaults.removeObject(forKey: $0) }
    }

    private func date(forKey key: String) -> Date? {
        guard defaults.object(forKey: key) != nil else { return nil }
        return Date(timeIntervalSince1970: defaults.double(forKey: key))
    }

    private func persistedAnchor() -> CLLocation? {
        guard
            defaults.object(forKey: DefaultsKey.anchorLatitude) != nil,
            defaults.object(forKey: DefaultsKey.anchorLongitude) != nil
        else { return nil }
        let coordinate = CLLocationCoordinate2D(
            latitude: defaults.double(forKey: DefaultsKey.anchorLatitude),
            longitude: defaults.double(forKey: DefaultsKey.anchorLongitude)
        )
        let timestamp = date(forKey: DefaultsKey.anchorTimestamp) ?? Date()
        return CLLocation(
            coordinate: coordinate,
            altitude: 0,
            horizontalAccuracy: defaults.double(forKey: DefaultsKey.anchorAccuracy),
            verticalAccuracy: -1,
            timestamp: timestamp
        )
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard liveRequested, let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        MysteryProximityService.shared.accept(location)
        LiveActivityController.shared.setLocationAcquisitionHealthy()

        if mode == .powerSaving {
            guard location.timestamp > modeChangedAt else { return }
            if let anchor = stationaryAnchor,
               location.speed < walkingSpeed,
               location.distance(from: anchor) < wakeRegionRadius {
                return
            }
            promoteFromPowerSaving(reason: "low-power-location")
            return
        }

        guard mode == .precise, location.timestamp > modeChangedAt else { return }
        if waitingForFreshPreciseFix {
            let acquisitionAge = Date().timeIntervalSince(freshFixAcquisitionBeganAt ?? Date())
            let acceptableAccuracy = acquisitionAge < 60 ? 50.0 : 100.0
            guard location.horizontalAccuracy <= acceptableAccuracy else { return }
        }
        let meaningfulMovement = isMeaningfulMovement(location)
        lastPreciseFix = location
        if waitingForFreshPreciseFix {
            waitingForFreshPreciseFix = false
            freshFixAcquisitionBeganAt = nil
            configurePreciseManager()
        }
        if meaningfulMovement {
            lastMeaningfulAt = Date()
            stationaryAnchor = location
            persistState()
            scheduleStationaryTimer()
        }
        NativeLocationPublisher.shared.accept(location, forcedReason: forcedPublishReason)
        forcedPublishReason = nil
        emitLocation(location)
        if !meaningfulMovement,
           let lastMeaningfulAt,
           Date().timeIntervalSince(lastMeaningfulAt) >= stationaryInterval {
            enterPowerSavingMode(anchor: lastPreciseFix, reason: "stationary-location")
        }
    }

    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
        standardUpdatesRunning = false
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": "ios-pause"
        ])
    }

    func locationManagerDidResumeLocationUpdates(_ manager: CLLocationManager) {
        if mode == .powerSaving {
            manager.stopUpdatingLocation()
            standardUpdatesRunning = false
        } else {
            standardUpdatesRunning = true
        }
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": "ios-resume"
        ])
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == wakeRegionIdentifier else { return }
        promoteFromPowerSaving(reason: "region-exit")
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let isTransientLocationUnknown = (error as? CLError)?.code == .locationUnknown
        if liveRequested, !isTransientLocationUnknown {
            LiveActivityController.shared.setLocationAcquisitionFailed()
        }
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": modeChangedReason,
            "error": error.localizedDescription,
            "code": (error as? CLError)?.code.rawValue ?? -1,
            "transient": isTransientLocationUnknown
        ])
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard liveRequested else { return }
        switch manager.authorizationStatus {
        case .denied, .restricted:
            LiveActivityController.shared.setLocationAcquisitionFailed()
        case .authorizedAlways:
            startMotionUpdates()
            if mode == .powerSaving { configurePowerSavingManager() }
            else { enterPreciseMode(resetIdleWindow: true, reason: "authorization-change") }
        default:
            break
        }
        emitState()
    }
}

private final class MainThreadHeartbeat {
    private enum DefaultsKey {
        static let hangSummary = "tripcast.nativeMainThread.hangSummary"
    }

    private let queue = DispatchQueue(label: "com.tripcast.main-thread-heartbeat")
    private let defaults = UserDefaults.standard
    private var timer: DispatchSourceTimer?
    private var active = false
    private var awaitingResponse = false
    private var pingStartedAt: Date?
    private var reportedThisSession = false

    func setActive(_ active: Bool) {
        queue.async {
            self.active = active
            self.awaitingResponse = false
            self.pingStartedAt = nil
            if active { self.startTimerIfNeeded() }
        }
    }

    func consumePreviousHangSummary() -> JSObject? {
        guard let data = defaults.data(forKey: DefaultsKey.hangSummary),
              let value = try? JSONSerialization.jsonObject(with: data) as? JSObject else { return nil }
        defaults.removeObject(forKey: DefaultsKey.hangSummary)
        return value
    }

    private func startTimerIfNeeded() {
        guard timer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 1, repeating: 1)
        timer.setEventHandler { [weak self] in self?.tick() }
        self.timer = timer
        timer.resume()
    }

    private func tick() {
        guard active else { return }
        if awaitingResponse,
           let pingStartedAt,
           Date().timeIntervalSince(pingStartedAt) >= 5,
           !reportedThisSession {
            reportedThisSession = true
            let summary: JSObject = [
                "detectedAt": Date().timeIntervalSince1970 * 1_000,
                "stallDurationMs": Int(Date().timeIntervalSince(pingStartedAt) * 1_000),
                "thresholdMs": 5_000
            ]
            if let data = try? JSONSerialization.data(withJSONObject: summary) {
                defaults.set(data, forKey: DefaultsKey.hangSummary)
            }
            return
        }
        guard !awaitingResponse else { return }
        awaitingResponse = true
        pingStartedAt = Date()
        DispatchQueue.main.async { [weak self] in
            self?.queue.async {
                self?.awaitingResponse = false
                self?.pingStartedAt = nil
            }
        }
    }
}
