import ActivityKit
import Capacitor
import Foundation
import UserNotifications

final class LiveActivityController {
    static let shared = LiveActivityController()

    private struct AlertIncident: Codable {
        let id: String
        var kind: String
        var failureSources: Set<String>?
        var eligibleSince: Date
        var scheduledFireAt: Date?
        var alerted: Bool
    }

    private enum FailureSource: String {
        case acquisition
        case publishing
    }

    private enum DefaultsKey {
        static let alertIncident = "tripcast.liveActivity.alertIncident"
    }

    private let staleNotificationIdentifier = "tripcast-live-stale"
    private let renewalNotificationIdentifier = "tripcast-live-activity-renewal"
    private let stateQueue = DispatchQueue(label: "com.tripcast.live-activity-controller")
    private let defaults = UserDefaults.standard
    private var alertThresholdSeconds: TimeInterval = 120
    private var lastAcknowledgedAt: Date?
    private var mode = "off"
    private var queueDepth = 0
    private var motionState = "unknown"
    private var motionConfidence = "unknown"
    private var motionStartedAt: Date?
    private var activeFailureSources: Set<FailureSource> = []
    private var alertIncident: AlertIncident?
    private var lastDeduplicatedIncidentID: String?
    private var availableImplementation: AnyObject?

    var eventHandler: ((JSObject) -> Void)?

    private init() {
        if let data = defaults.data(forKey: DefaultsKey.alertIncident) {
            alertIncident = try? JSONDecoder().decode(AlertIncident.self, from: data)
            if alertIncident?.kind == "failure" {
                let persistedSources = alertIncident?.failureSources ?? [FailureSource.publishing.rawValue]
                activeFailureSources = Set(persistedSources.compactMap { FailureSource(rawValue: $0) })
            }
        }
    }

    func configure(alertThresholdSeconds: TimeInterval) {
        stateQueue.async {
            self.alertThresholdSeconds = max(0, alertThresholdSeconds)
            guard self.alertThresholdSeconds > 0 else {
                self.clearAlertIncident(reason: "alert-disabled", removeDelivered: true)
                self.cancelRenewalNotification()
                return
            }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
            if self.mode != "off" {
                self.prepareForCurrentMode(reason: "configured")
            }
        }
    }

    func start(mode: String, queueDepth: Int) {
        stateQueue.async {
            self.mode = mode
            self.queueDepth = queueDepth
            if #available(iOS 16.1, *) {
                self.implementation().startIfNeeded(state: self.state())
            }
            self.scheduleRenewalNotification()
            self.prepareForCurrentMode(reason: "live-start")
        }
    }

    func stop() {
        stateQueue.async {
            self.mode = "off"
            self.queueDepth = 0
            self.lastAcknowledgedAt = nil
            self.motionState = "unknown"
            self.motionConfidence = "unknown"
            self.motionStartedAt = nil
            self.activeFailureSources.removeAll()
            self.clearAlertIncident(reason: "live-stopped", removeDelivered: true)
            self.cancelRenewalNotification()
            if #available(iOS 16.1, *) {
                self.implementation().stop()
            }
        }
    }

    func setMode(_ mode: String, queueDepth: Int) {
        stateQueue.async {
            let previousMode = self.mode
            self.mode = mode
            self.queueDepth = queueDepth
            if mode == "off" || mode == "privacy" {
                self.activeFailureSources.removeAll()
                self.clearAlertIncident(reason: mode, removeDelivered: true)
            } else if mode == "power-saving" {
                if self.activeFailureSources.isEmpty {
                    self.clearAlertIncident(reason: "power-saving", removeDelivered: true)
                } else {
                    self.ensureFailureIncident(reason: "mode-power-saving")
                    self.scheduleStaleNotificationIfNeeded(reason: "mode-power-saving")
                }
            } else if mode == "precise",
                      (previousMode == "power-saving" || previousMode == "privacy"),
                      self.activeFailureSources.isEmpty {
                self.restartEligibilityWindow(reason: "precise-resumed")
            } else {
                if !self.activeFailureSources.isEmpty {
                    self.ensureFailureIncident(reason: "mode-\(mode)")
                }
                self.scheduleStaleNotificationIfNeeded(reason: "mode-\(mode)")
            }
            self.updateActivity()
        }
    }

    func setQueueDepth(_ queueDepth: Int) {
        stateQueue.async {
            self.queueDepth = queueDepth
            self.updateActivity()
        }
    }

    func setMotion(state: String, confidence: String, startedAt: Date) {
        stateQueue.async {
            let wasTrustedMoving = self.isTrustedMoving
            self.motionState = state
            self.motionConfidence = confidence
            self.motionStartedAt = startedAt
            if !self.activeFailureSources.isEmpty {
                self.ensureFailureIncident(reason: "motion-\(state)-with-failure")
                self.scheduleStaleNotificationIfNeeded(reason: "motion-\(state)-with-failure")
            } else if self.isTrustedMoving {
                if wasTrustedMoving {
                    self.scheduleStaleNotificationIfNeeded(reason: "motion-\(state)")
                } else {
                    self.restartEligibilityWindow(reason: "trusted-motion-detected")
                }
            } else {
                self.clearAlertIncident(reason: "motion-not-confirmed", removeDelivered: true)
            }
            self.updateActivity()
        }
    }

    func acknowledge(at date: Date, mode: String, queueDepth: Int) {
        stateQueue.async {
            self.lastAcknowledgedAt = date
            self.mode = mode
            self.queueDepth = queueDepth
            let publishingRecovered = self.activeFailureSources.remove(.publishing) != nil
            if publishingRecovered {
                self.emit("gps:stale-alert:failure-resolved", details: [
                    "reason": "server-ack",
                    "source": FailureSource.publishing.rawValue
                ])
            }
            if self.activeFailureSources.isEmpty {
                self.clearAlertIncident(reason: "server-ack", removeDelivered: true)
                if self.canAlert {
                    self.beginAlertIncident(kind: "watch", eligibleSince: date, reason: "server-ack-watch")
                    self.scheduleStaleNotificationIfNeeded(reason: "server-ack-watch")
                }
            } else {
                self.ensureFailureIncident(reason: "server-ack-with-active-failure")
                self.scheduleStaleNotificationIfNeeded(reason: "server-ack-with-active-failure")
            }
            self.updateActivity()
        }
    }

    func setRecovering(queueDepth: Int) {
        stateQueue.async {
            self.queueDepth = queueDepth
            self.reportFailure(.publishing, reason: "publish-failure")
            self.updateActivity()
        }
    }

    func setPublishingHealthy(queueDepth: Int) {
        stateQueue.async {
            self.queueDepth = queueDepth
            self.resolveFailure(.publishing, reason: "publish-recovered", watchEligibleSince: Date())
            self.updateActivity()
        }
    }

    func setLocationAcquisitionFailed() {
        stateQueue.async {
            self.reportFailure(.acquisition, reason: "location-acquisition-failure")
            self.updateActivity()
        }
    }

    func setLocationAcquisitionHealthy() {
        stateQueue.async {
            self.resolveFailure(.acquisition, reason: "location-acquisition-recovered", watchEligibleSince: Date())
            self.updateActivity()
        }
    }

    func setPrivacyPaused(lastAcknowledgedAt: Date?) {
        stateQueue.async {
            self.mode = "privacy"
            self.activeFailureSources.removeAll()
            if let lastAcknowledgedAt { self.lastAcknowledgedAt = lastAcknowledgedAt }
            self.clearAlertIncident(reason: "privacy", removeDelivered: true)
            self.updateActivity()
        }
    }

    private var isTrustedMoving: Bool {
        let movingStates = ["walking", "running", "cycling", "automotive"]
        let trustedConfidence = motionConfidence == "medium" || motionConfidence == "high"
        return trustedConfidence && movingStates.contains(motionState)
    }

    private var canAlert: Bool {
        guard alertThresholdSeconds > 0, mode != "off", mode != "privacy" else { return false }
        if !activeFailureSources.isEmpty || alertIncident?.kind == "failure" {
            return true
        }
        return mode == "precise" && isTrustedMoving
    }

    private func prepareForCurrentMode(reason: String) {
        guard canAlert else {
            if activeFailureSources.isEmpty {
                clearAlertIncident(
                    reason: mode == "power-saving" ? "power-saving" : "not-alertable",
                    removeDelivered: true
                )
            } else {
                cancelPendingAlert(reason: "not-alertable")
            }
            updateActivity()
            return
        }
        if alertIncident == nil {
            if activeFailureSources.isEmpty {
                beginAlertIncident(kind: "watch", eligibleSince: lastAcknowledgedAt ?? Date(), reason: reason)
            } else {
                beginAlertIncident(kind: "failure", eligibleSince: Date(), reason: reason)
            }
        }
        scheduleStaleNotificationIfNeeded(reason: reason)
        updateActivity()
    }

    private func restartEligibilityWindow(reason: String) {
        guard canAlert, activeFailureSources.isEmpty else { return }
        reconcileDeliveredAlert(reason: reason)
        if alertIncident?.alerted == true {
            emit("gps:stale-alert:deduplicated", details: ["reason": reason])
            return
        }
        clearAlertIncident(reason: reason, removeDelivered: true)
        beginAlertIncident(kind: "watch", eligibleSince: Date(), reason: reason)
        scheduleStaleNotificationIfNeeded(reason: reason)
    }

    private func beginAlertIncident(kind: String, eligibleSince: Date, reason: String) {
        alertIncident = AlertIncident(
            id: UUID().uuidString.lowercased(),
            kind: kind,
            failureSources: kind == "failure" ? persistedFailureSources : nil,
            eligibleSince: eligibleSince,
            scheduledFireAt: nil,
            alerted: false
        )
        lastDeduplicatedIncidentID = nil
        persistAlertIncident()
        emit("gps:stale-alert:incident-started", details: [
            "reason": reason,
            "kind": kind,
            "eligibleSince": eligibleSince.timeIntervalSince1970 * 1_000
        ])
    }

    private var persistedFailureSources: Set<String> {
        Set(activeFailureSources.map(\.rawValue))
    }

    private func ensureFailureIncident(reason: String) {
        if alertIncident == nil {
            beginAlertIncident(kind: "failure", eligibleSince: Date(), reason: reason)
            return
        }
        alertIncident?.kind = "failure"
        alertIncident?.failureSources = persistedFailureSources
        persistAlertIncident()
    }

    private func reportFailure(_ source: FailureSource, reason: String) {
        guard mode != "off", mode != "privacy" else {
            emit("gps:stale-alert:failure-suppressed", details: [
                "reason": reason,
                "source": source.rawValue,
                "mode": mode
            ])
            return
        }
        let inserted = activeFailureSources.insert(source).inserted
        reconcileDeliveredAlert(reason: reason)
        ensureFailureIncident(reason: reason)
        scheduleStaleNotificationIfNeeded(reason: reason)
        if inserted {
            emit("gps:stale-alert:failure-started", details: [
                "reason": reason,
                "source": source.rawValue
            ])
        }
    }

    private func resolveFailure(
        _ source: FailureSource,
        reason: String,
        watchEligibleSince: Date
    ) {
        guard activeFailureSources.remove(source) != nil else {
            if activeFailureSources.isEmpty, alertIncident?.kind == "watch" {
                scheduleStaleNotificationIfNeeded(reason: reason)
            }
            return
        }
        emit("gps:stale-alert:failure-resolved", details: [
            "reason": reason,
            "source": source.rawValue
        ])
        if !activeFailureSources.isEmpty {
            ensureFailureIncident(reason: reason)
            scheduleStaleNotificationIfNeeded(reason: reason)
            return
        }
        clearAlertIncident(reason: reason, removeDelivered: true)
        if canAlert {
            beginAlertIncident(kind: "watch", eligibleSince: watchEligibleSince, reason: "\(reason)-watch")
            scheduleStaleNotificationIfNeeded(reason: "\(reason)-watch")
        }
    }

    private func scheduleStaleNotificationIfNeeded(reason: String) {
        guard canAlert else {
            cancelPendingAlert(reason: "not-alertable")
            return
        }
        if alertIncident == nil {
            beginAlertIncident(
                kind: activeFailureSources.isEmpty ? "watch" : "failure",
                eligibleSince: Date(),
                reason: reason
            )
        }
        reconcileDeliveredAlert(reason: reason)
        guard alertIncident?.alerted != true else {
            if lastDeduplicatedIncidentID != alertIncident?.id {
                lastDeduplicatedIncidentID = alertIncident?.id
                emit("gps:stale-alert:deduplicated", details: ["reason": reason])
            }
            return
        }
        guard var incident = alertIncident else { return }

        let fireAt = incident.eligibleSince.addingTimeInterval(alertThresholdSeconds)
        if let existingFireAt = incident.scheduledFireAt,
           abs(existingFireAt.timeIntervalSince(fireAt)) < 1 {
            return
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [staleNotificationIdentifier]
        )
        let delay = max(1, fireAt.timeIntervalSinceNow)
        let content = UNMutableNotificationContent()
        content.title = "TripCast Live needs attention"
        content.body = "TripCast couldn’t confirm location sharing. Open the app to check GPS or your connection."
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: staleNotificationIdentifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
        incident.scheduledFireAt = Date().addingTimeInterval(delay)
        alertIncident = incident
        persistAlertIncident()
        emit("gps:stale-alert:scheduled", details: [
            "reason": reason,
            "delayMs": delay * 1_000,
            "fireAt": incident.scheduledFireAt!.timeIntervalSince1970 * 1_000
        ])
    }

    private func reconcileDeliveredAlert(reason: String) {
        guard var incident = alertIncident,
              let scheduledFireAt = incident.scheduledFireAt,
              scheduledFireAt <= Date() else { return }
        incident.alerted = true
        incident.scheduledFireAt = nil
        alertIncident = incident
        persistAlertIncident()
        emit("gps:stale-alert:delivery-assumed", details: ["reason": reason])
    }

    private func cancelPendingAlert(reason: String) {
        guard var incident = alertIncident else {
            UNUserNotificationCenter.current().removePendingNotificationRequests(
                withIdentifiers: [staleNotificationIdentifier]
            )
            return
        }
        if let scheduledFireAt = incident.scheduledFireAt, scheduledFireAt <= Date() {
            incident.alerted = true
        }
        let hadPendingAlert = incident.scheduledFireAt != nil && !incident.alerted
        incident.scheduledFireAt = nil
        alertIncident = incident
        persistAlertIncident()
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [staleNotificationIdentifier]
        )
        if hadPendingAlert {
            emit("gps:stale-alert:cancelled", details: ["reason": reason])
        }
    }

    private func clearAlertIncident(reason: String, removeDelivered: Bool) {
        let hadIncident = alertIncident != nil
        alertIncident = nil
        lastDeduplicatedIncidentID = nil
        defaults.removeObject(forKey: DefaultsKey.alertIncident)
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [staleNotificationIdentifier]
        )
        if removeDelivered {
            UNUserNotificationCenter.current().removeDeliveredNotifications(
                withIdentifiers: [staleNotificationIdentifier]
            )
        }
        if hadIncident {
            emit("gps:stale-alert:incident-cleared", details: ["reason": reason])
        }
    }

    private func persistAlertIncident() {
        guard let alertIncident,
              let data = try? JSONEncoder().encode(alertIncident) else {
            defaults.removeObject(forKey: DefaultsKey.alertIncident)
            return
        }
        defaults.set(data, forKey: DefaultsKey.alertIncident)
    }

    private func emit(_ action: String, level: String = "info", details: JSObject) {
        eventHandler?([
            "action": action,
            "level": level,
            "details": details
        ])
    }

    private func updateActivity() {
        if #available(iOS 16.1, *) {
            implementation().update(state: state())
        }
    }

    @available(iOS 16.1, *)
    private func implementation() -> AvailableLiveActivityController {
        if let existing = availableImplementation as? AvailableLiveActivityController {
            return existing
        }
        let created = AvailableLiveActivityController()
        availableImplementation = created
        return created
    }

    @available(iOS 16.1, *)
    private func state() -> TripCastLiveActivityAttributes.ContentState {
        let health: String
        let message: String
        let displayedMode = activeFailureSources.isEmpty ? mode : "recovering"
        switch displayedMode {
        case "power-saving":
            health = "neutral"
            message = "Waiting for movement"
        case "privacy":
            health = "neutral"
            message = "Location hidden"
        case "recovering":
            health = "warning"
            message = queueDepth > 0 ? "\(queueDepth) breadcrumbs queued" : "Reconnecting…"
        case "precise":
            let stale = alertIncident?.alerted == true ||
                (canAlert && alertIncident.map {
                    Date().timeIntervalSince($0.eligibleSince) >= alertThresholdSeconds
                } == true)
            health = stale ? "stale" : "healthy"
            message = stale ? "Confirmation delayed" : "Sharing normally"
        default:
            health = "neutral"
            message = "Live is off"
        }
        return .init(
            mode: displayedMode,
            health: health,
            lastAcknowledgedAt: lastAcknowledgedAt,
            queueDepth: queueDepth,
            message: message,
            motionState: motionState,
            motionStartedAt: motionStartedAt
        )
    }

    private func scheduleRenewalNotification() {
        cancelRenewalNotification()
        guard alertThresholdSeconds > 0 else { return }
        let content = UNMutableNotificationContent()
        content.title = "TripCast status needs refreshing"
        content.body = "Open TripCast to renew the Lock Screen Live status."
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: renewalNotificationIdentifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 7.75 * 60 * 60, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func cancelRenewalNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [renewalNotificationIdentifier]
        )
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: [renewalNotificationIdentifier]
        )
    }
}

@available(iOS 16.1, *)
private final class AvailableLiveActivityController: NSObject {
    private var activity: Activity<TripCastLiveActivityAttributes>?

    func startIfNeeded(state: TripCastLiveActivityAttributes.ContentState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if let existing = Activity<TripCastLiveActivityAttributes>.activities.first {
            activity = existing
            update(state: state)
            return
        }
        do {
            activity = try Activity.request(
                attributes: TripCastLiveActivityAttributes(startedAt: Date()),
                contentState: state,
                pushType: nil
            )
        } catch {
            activity = nil
        }
    }

    func update(state: TripCastLiveActivityAttributes.ContentState) {
        guard let activity else { return }
        Task { await activity.update(using: state) }
    }

    func stop() {
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(dismissalPolicy: .immediate) }
    }
}
