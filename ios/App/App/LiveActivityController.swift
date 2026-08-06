import ActivityKit
import Foundation
import UserNotifications

final class LiveActivityController {
    static let shared = LiveActivityController()

    private let staleNotificationIdentifier = "tripcast-live-stale"
    private let renewalNotificationIdentifier = "tripcast-live-activity-renewal"
    private var alertThresholdSeconds: TimeInterval = 120
    private var lastAcknowledgedAt: Date?
    private var mode = "off"
    private var queueDepth = 0
    private var motionState = "unknown"
    private var motionConfidence = "unknown"
    private var availableImplementation: AnyObject?

    private init() {}

    func configure(alertThresholdSeconds: TimeInterval) {
        self.alertThresholdSeconds = max(0, alertThresholdSeconds)
        guard self.alertThresholdSeconds > 0 else {
            cancelNotifications()
            return
        }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        scheduleStaleNotificationIfNeeded()
    }

    func start(mode: String, queueDepth: Int) {
        self.mode = mode
        self.queueDepth = queueDepth
        if #available(iOS 16.1, *) {
            let implementation = implementation()
            implementation.startIfNeeded(state: state())
        }
        scheduleRenewalNotification()
        scheduleStaleNotificationIfNeeded()
    }

    func stop() {
        mode = "off"
        queueDepth = 0
        lastAcknowledgedAt = nil
        motionState = "unknown"
        motionConfidence = "unknown"
        cancelNotifications()
        if #available(iOS 16.1, *) {
            implementation().stop()
        }
    }

    func setMode(_ mode: String, queueDepth: Int) {
        self.mode = mode
        self.queueDepth = queueDepth
        updateActivity()
        scheduleStaleNotificationIfNeeded()
    }

    func setQueueDepth(_ queueDepth: Int) {
        self.queueDepth = queueDepth
        updateActivity()
        scheduleStaleNotificationIfNeeded()
    }

    func setMotion(state: String, confidence: String) {
        motionState = state
        motionConfidence = confidence
        updateActivity()
        scheduleStaleNotificationIfNeeded()
    }

    func acknowledge(at date: Date, mode: String, queueDepth: Int) {
        lastAcknowledgedAt = date
        self.mode = mode
        self.queueDepth = queueDepth
        updateActivity()
        scheduleStaleNotificationIfNeeded()
    }

    func setRecovering(queueDepth: Int) {
        mode = "recovering"
        self.queueDepth = queueDepth
        updateActivity()
        scheduleStaleNotificationIfNeeded()
    }

    func setPrivacyPaused(lastAcknowledgedAt: Date?) {
        mode = "privacy"
        if let lastAcknowledgedAt { self.lastAcknowledgedAt = lastAcknowledgedAt }
        cancelStaleNotification()
        updateActivity()
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
            let stale = lastAcknowledgedAt.map {
                alertThresholdSeconds > 0 && Date().timeIntervalSince($0) >= alertThresholdSeconds
            } ?? false
            health = stale ? "stale" : "healthy"
            message = stale ? "Open TripCast" : "Live"
        default:
            health = "neutral"
            message = "Live is off"
        }
        return .init(
            mode: mode,
            health: health,
            lastAcknowledgedAt: lastAcknowledgedAt,
            queueDepth: queueDepth,
            message: message
        )
    }

    private func scheduleStaleNotificationIfNeeded() {
        cancelStaleNotification()
        guard alertThresholdSeconds > 0,
              mode == "precise" || mode == "recovering" else { return }
        let deliveryProblemKnown = mode == "recovering" || queueDepth > 0
        let trustedStationary = motionState == "stationary" &&
            (motionConfidence == "medium" || motionConfidence == "high")
        guard deliveryProblemKnown || !trustedStationary else { return }
        let baseline = lastAcknowledgedAt ?? Date()
        let delay = max(1, baseline.addingTimeInterval(alertThresholdSeconds).timeIntervalSinceNow)
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
    }

    private func scheduleRenewalNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [renewalNotificationIdentifier]
        )
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

    private func cancelStaleNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [staleNotificationIdentifier]
        )
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: [staleNotificationIdentifier]
        )
    }

    private func cancelNotifications() {
        let identifiers = [staleNotificationIdentifier, renewalNotificationIdentifier]
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: identifiers)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: identifiers)
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
