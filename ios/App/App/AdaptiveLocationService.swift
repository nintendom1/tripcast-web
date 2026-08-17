import CoreLocation
import CoreMotion
import Foundation
import Capacitor

final class AdaptiveLocationService: NSObject, CLLocationManagerDelegate {
    static let shared = AdaptiveLocationService()

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

    private(set) var mode: Mode = .off
    private(set) var liveRequested = false
    private var calibrationActive = false
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
    private var backgroundActivitySession: AnyObject?
    private var motionUpdatesRunning = false
    private var motionState = "unknown"
    private var motionConfidence = "unknown"
    private var motionChangedAt = Date.distantPast

    var eventHandler: ((JSObject) -> Void)? {
        didSet { deliverPendingEventIfNeeded() }
    }
    private var pendingEvent: JSObject?

    private override init() {
        super.init()
        manager.delegate = self
        NativeLocationPublisher.shared.eventHandler = { [weak self] event in
            guard let self else { return }
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
    }

    func bootstrapLocationRelaunch() {
        guard defaults.bool(forKey: DefaultsKey.liveRequested) else { return }
        restorePersistedStateAndStart()
    }

    func startLive() {
        if liveRequested, mode != .off {
            emitState()
            return
        }
        liveRequested = true
        defaults.set(true, forKey: DefaultsKey.liveRequested)
        requestAuthorization()
        startMotionUpdates()
        ensureBackgroundActivitySession()
        enterPreciseMode(resetIdleWindow: true, reason: "live-start")
    }

    func stopLive(clearCredentials: Bool = false, preserveSamples: Bool = false) {
        liveRequested = false
        calibrationActive = false
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
        clearPersistedTrackingState()
        NativeLocationPublisher.shared.stopLive(
            clearCredentials: clearCredentials,
            preserveSamples: preserveSamples
        )
        emitState()
    }

    func setCalibrationActive(_ active: Bool) {
        calibrationActive = active
        guard liveRequested else { return }
        if active {
            if mode == .powerSaving {
                enterPreciseMode(resetIdleWindow: true, reason: "calibration-start")
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

    func currentState() -> JSObject {
        [
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": modeChangedReason,
            "motionState": motionState,
            "motionConfidence": motionConfidence,
            "motionChangedAt": motionChangedAt.timeIntervalSince1970 * 1_000
        ]
    }

    func applicationDidBecomeActive() {
        if !liveRequested, defaults.bool(forKey: DefaultsKey.liveRequested) {
            restorePersistedStateAndStart()
            return
        }
        guard liveRequested else { return }
        ensureBackgroundActivitySession()
        startMotionUpdates()
        if mode == .precise,
           modeChangedReason == "foreground",
           Date().timeIntervalSince(modeChangedAt) < 2 {
            return
        }
        enterPreciseMode(resetIdleWindow: true, reason: "foreground")
    }

    private func restorePersistedStateAndStart() {
        liveRequested = true
        mode = Mode(rawValue: defaults.string(forKey: DefaultsKey.mode) ?? "") ?? .precise
        modeChangedAt = date(forKey: DefaultsKey.modeChangedAt) ?? Date()
        modeChangedReason = defaults.string(forKey: DefaultsKey.modeChangedReason) ?? "location-relaunch"
        lastMeaningfulAt = date(forKey: DefaultsKey.lastMeaningfulAt) ?? Date()
        stationaryAnchor = persistedAnchor()
        ensureBackgroundActivitySession()
        startMotionUpdates()
        NativeLocationPublisher.shared.startLive(mode: mode.rawValue)

        if mode == .powerSaving, stationaryAnchor != nil {
            configurePowerSavingManager()
        } else {
            enterPreciseMode(resetIdleWindow: false, reason: "location-relaunch")
        }
        requestAuthorization()
        emitState()
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
        if activity.stationary {
            state = "stationary"
        } else if activity.cycling {
            state = "cycling"
        } else if activity.walking {
            state = "walking"
        } else if activity.running {
            state = "running"
        } else if activity.automotive {
            state = "automotive"
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
        NativeLocationPublisher.shared.startLive(mode: mode.rawValue)
        emitState()
    }

    private func configurePreciseManager(acquiringFreshFix: Bool = false) {
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        if calibrationActive || acquiringFreshFix {
            manager.distanceFilter = kCLDistanceFilterNone
        } else {
            manager.distanceFilter = preciseDistanceFilter
        }
        manager.activityType = .fitness
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
    }

    private func enterPowerSavingMode(anchor: CLLocation?, reason: String) {
        guard liveRequested, !calibrationActive, mode == .precise else { return }
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
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
        ensureStandardUpdatesRunning()
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
        guard liveRequested, mode == .precise, !calibrationActive else { return }
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
        if #available(iOS 17.0, *),
           let session = backgroundActivitySession as? CLBackgroundActivitySession {
            session.invalidate()
        }
        backgroundActivitySession = nil
    }

    private func ensureBackgroundActivitySession() {
        guard backgroundActivitySession == nil else { return }
        if #available(iOS 17.0, *) {
            backgroundActivitySession = CLBackgroundActivitySession()
        }
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
        if let eventHandler {
            eventHandler(event)
        } else {
            pendingEvent = event
        }
    }

    private func deliverPendingEventIfNeeded() {
        guard let eventHandler, let pendingEvent else { return }
        self.pendingEvent = nil
        eventHandler(pendingEvent)
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
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "reason": "unexpected-ios-pause"
        ])
        manager.startUpdatingLocation()
        standardUpdatesRunning = true
    }

    func locationManagerDidResumeLocationUpdates(_ manager: CLLocationManager) {
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
        default:
            break
        }
    }
}
