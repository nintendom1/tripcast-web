import CoreLocation
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
    }

    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private let stationaryInterval: TimeInterval = 5 * 60
    private let movementDistance: CLLocationDistance = 50
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
    private var stationaryTimer: Timer?
    private var waitingForFreshPreciseFix = false

    var eventHandler: ((JSObject) -> Void)? {
        didSet { deliverPendingEventIfNeeded() }
    }
    private var pendingEvent: JSObject?

    private override init() {
        super.init()
        manager.delegate = self
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
        enterPreciseMode(resetIdleWindow: true)
    }

    func stopLive() {
        liveRequested = false
        calibrationActive = false
        stationaryTimer?.invalidate()
        stationaryTimer = nil
        stopAllLocationServices()
        stationaryAnchor = nil
        lastPreciseFix = nil
        lastMeaningfulAt = nil
        waitingForFreshPreciseFix = false
        mode = .off
        modeChangedAt = Date()
        clearPersistedTrackingState()
        emitState()
    }

    func setCalibrationActive(_ active: Bool) {
        calibrationActive = active
        guard liveRequested else { return }
        if active {
            if mode == .powerSaving {
                enterPreciseMode(resetIdleWindow: true)
            } else {
                configurePreciseManager()
                manager.distanceFilter = kCLDistanceFilterNone
                scheduleStationaryTimer()
            }
        } else if mode == .precise {
            configurePreciseManager()
            scheduleStationaryTimer()
        }
    }

    func currentState() -> JSObject {
        [
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000
        ]
    }

    private func restorePersistedStateAndStart() {
        liveRequested = true
        mode = Mode(rawValue: defaults.string(forKey: DefaultsKey.mode) ?? "") ?? .precise
        modeChangedAt = date(forKey: DefaultsKey.modeChangedAt) ?? Date()
        lastMeaningfulAt = date(forKey: DefaultsKey.lastMeaningfulAt) ?? Date()
        stationaryAnchor = persistedAnchor()

        if mode == .powerSaving, stationaryAnchor != nil {
            configurePowerSavingManager()
        } else {
            enterPreciseMode(resetIdleWindow: false)
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
        default:
            break
        }
    }

    private func enterPreciseMode(resetIdleWindow: Bool) {
        stopLowPowerMonitors()
        manager.stopUpdatingLocation()
        mode = .precise
        modeChangedAt = Date()
        waitingForFreshPreciseFix = true
        if resetIdleWindow || lastMeaningfulAt == nil {
            lastMeaningfulAt = Date()
        }
        configurePreciseManager()
        manager.startUpdatingLocation()
        persistState()
        scheduleStationaryTimer()
        emitState()
    }

    private func configurePreciseManager() {
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = calibrationActive ? kCLDistanceFilterNone : movementDistance
        manager.activityType = .otherNavigation
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = true
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = false
        }
    }

    private func enterPowerSavingMode(anchor: CLLocation?) {
        guard liveRequested, !calibrationActive, mode == .precise else { return }
        stationaryTimer?.invalidate()
        stationaryTimer = nil
        if let anchor { stationaryAnchor = anchor }
        if stationaryAnchor == nil { stationaryAnchor = lastPreciseFix }
        guard stationaryAnchor != nil else {
            scheduleStationaryTimer()
            return
        }

        manager.stopUpdatingLocation()
        mode = .powerSaving
        modeChangedAt = Date()
        waitingForFreshPreciseFix = false
        configurePowerSavingManager()
        persistState()
        emitState()
    }

    private func configurePowerSavingManager() {
        manager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
        manager.distanceFilter = 100
        manager.activityType = .other
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        manager.startUpdatingLocation()
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

    private func promoteFromPowerSaving() {
        guard liveRequested, mode == .powerSaving else { return }
        enterPreciseMode(resetIdleWindow: true)
    }

    private func scheduleStationaryTimer() {
        stationaryTimer?.invalidate()
        guard liveRequested, mode == .precise, !calibrationActive else { return }
        let meaningfulAt = lastMeaningfulAt ?? Date()
        let remaining = max(0.1, stationaryInterval - Date().timeIntervalSince(meaningfulAt))
        stationaryTimer = Timer.scheduledTimer(withTimeInterval: remaining, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.enterPowerSavingMode(anchor: self.lastPreciseFix)
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
        stopLowPowerMonitors()
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
            DefaultsKey.modeChangedAt
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

        if mode == .powerSaving {
            guard location.timestamp > modeChangedAt else { return }
            if let anchor = stationaryAnchor,
               location.speed < walkingSpeed,
               location.distance(from: anchor) < wakeRegionRadius {
                return
            }
            promoteFromPowerSaving()
            return
        }

        guard mode == .precise, location.timestamp > modeChangedAt else { return }
        let meaningfulMovement = isMeaningfulMovement(location)
        lastPreciseFix = location
        if waitingForFreshPreciseFix {
            waitingForFreshPreciseFix = false
        }
        if meaningfulMovement {
            lastMeaningfulAt = Date()
            stationaryAnchor = location
            persistState()
            scheduleStationaryTimer()
        }
        emitLocation(location)
    }

    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
        enterPowerSavingMode(anchor: lastPreciseFix)
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == wakeRegionIdentifier else { return }
        promoteFromPowerSaving()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        emit([
            "mode": mode.rawValue,
            "liveRequested": liveRequested,
            "changedAt": modeChangedAt.timeIntervalSince1970 * 1_000,
            "error": error.localizedDescription,
            "code": (error as? CLError)?.code.rawValue ?? -1
        ])
    }
}
