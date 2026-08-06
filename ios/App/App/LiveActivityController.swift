import ActivityKit
import Capacitor
import Foundation
import UserNotifications

final class LiveActivityController {
    static let shared = LiveActivityController()

    private struct AlertIncident: Codable {
        let id: String
        let kind: String
        var eligibleSince: Date
        var scheduledFireAt: Date?
        var alerted: Bool
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
    private var alertIncident: AlertIncident?
    private var lastDeduplicatedIncidentID: String?
    private var availableImplementation: AnyObject?

    var eventHandler: ((JSObject) -> Void)?

    private init() {
        if let data = defaults.data(forKey: DefaultsKey.alertIncident) {
            alertIncident = try? JSONDecoder().decode(AlertIncident.self, from: data)
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
                self.scheduleStaleNotificationIfNeeded(reason: "configured")
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
                self.clearAlertIncident(reason: mode, removeDelivered: true)
            } else if mode == "power-saving" {
                self.cancelPendingAlert(reason: "power-saving")
            } else if mode == "precise",
                      previousMode == "power-saving" || previousMode == "privacy" {
                self.restartEligibilityWindow(reason: "precise-resumed")
            } else {
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
            let wasTrustedStationary = self.isTrustedStationary
            self.motionState = state
            self.motionConfidence = confidence
            self.motionStartedAt = startedAt
            if self.isTrustedStationary {
                self.cancelPendingAlert(reason: "trusted-stationary")
            } else if wasTrustedStationary {
                self.restartEligibilityWindow(reason: "motion-resumed")
            } else {
                self.scheduleStaleNotificationIfNeeded(reason: "motion-\(state)")
            }
            self.updateActivity()
        }
    }

    func acknowledge(at date: Date, mode: String, queueDepth: Int) {
        stateQueue.async {
            self.lastAcknowledgedAt = date
            self.mode = mode
            self.queueDepth = queueDepth
            self.clearAlertIncident(reason: "server-ack", removeDelivered: true)
            if self.canAlert {
                self.beginAlertIncident(kind: "watch", eligibleSince: date, reason: "server-ack-watch")
                self.scheduleStaleNotificationIfNeeded(reason: "server-ack-watch")
            }
            self.updateActivity()
        }
    }

    func setRecovering(queueDepth: Int) {
        stateQueue.async {
            self.mode = "recovering"
            self.queueDepth = queueDepth
            self.reconcileDeliveredAlert(reason: "publish-failure")
            if self.alertIncident == nil ||
                (self.alertIncident?.kind != "failure" && self.alertIncident?.alerted != true) {
                self.cancelPendingAlert(reason: "publish-failure")
                self.beginAlertIncident(kind: "failure", eligibleSince: Date(), reason: "publish-failure")
            }
            self.scheduleStaleNotificationIfNeeded(reason: "publish-failure")
            self.updateActivity()
        }
    }

    func setPrivacyPaused(lastAcknowledgedAt: Date?) {
        stateQueue.async {
            self.mode = "privacy"
            if let lastAcknowledgedAt { self.lastAcknowledgedAt = lastAcknowledgedAt }
            self.clearAlertIncident(reason: "privacy", removeDelivered: true)
            self.updateActivity()
        }
    }

    private var isTrustedStationary: Bool {
        motionState == "stationary" && (motionConfidence == "medium" || motionConfidence == "high")
    }

    private var canAlert: Bool {
        alertThresholdSeconds > 0 &&
            (mode == "precise" || mode == "recovering") &&
            !isTrustedStationary
    }

    private func prepareForCurrentMode(reason: String) {
        guard canAlert else {
            cancelPendingAlert(reason: mode == "power-saving" ? "power-saving" : "not-alertable")
            updateActivity()
            return
        }
        if alertIncident == nil {
            beginAlertIncident(kind: "watch", eligibleSince: lastAcknowledgedAt ?? Date(), reason: reason)
        }
        scheduleStaleNotificationIfNeeded(reason: reason)
        updateActivity()
    }

    private func restartEligibilityWindow(reason: String) {
        guard canAlert else { return }
        reconcileDeliveredAlert(reason: reason)
        if alertIncident?.alerted == true {
            emit("gps:stale-alert:deduplicated", details: ["reason": reason])
            return
        }
        cancelPendingAlert(reason: reason)
        beginAlertIncident(kind: alertIncident?.kind ?? "watch", eligibleSince: Date(), reason: reason)
        scheduleStaleNotificationIfNeeded(reason: reason)
    }

    private func beginAlertIncident(kind: String, eligibleSince: Date, reason: String) {
        alertIncident = AlertIncident(
            id: UUID().uuidString.lowercased(),
            kind: kind,
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

    private func scheduleStaleNotificationIfNeeded(reason: String) {
        guard canAlert else {
            cancelPendingAlert(reason: "not-alertable")
            return
        }
        if alertIncident == nil {
            beginAlertIncident(kind: mode == "recovering" ? "failure" : "watch", eligibleSince: Date(), reason: reason)
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
        content.title = "TripCast breadcrumbs are delayed"
        content.body = "Open TripCast to refresh Adaptive Background GPS."
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
        switch mode {
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
            mode: mode,
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
