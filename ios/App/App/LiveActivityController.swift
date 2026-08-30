import ActivityKit
import Capacitor
import Foundation
import UserNotifications

struct LiveActivityStopResult {
    let requestedCount: Int
    let remainingCount: Int
}

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
    private var lastActivityStateData: Data?
    private var lastActivityTransitionSignature: String?
    private var lastActivityUpdateAt: Date?
    private var healthyRefreshWorkItem: DispatchWorkItem?
    private var stopInFlight = false
    private var stopCompletions: [(LiveActivityStopResult) -> Void] = []

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

    func start(mode: String, queueDepth: Int, completion: @escaping (String) -> Void) {
        stateQueue.async {
            self.mode = mode
            self.queueDepth = queueDepth
            let outcome: String
            if #available(iOS 16.1, *) {
                let state = self.state()
                outcome = self.implementation().startIfNeeded(state: state)
                if outcome == "created" || outcome == "reused" {
                    self.recordActivitySubmission(state)
                }
            } else {
                outcome = "unsupported"
            }
            self.scheduleRenewalNotification()
            self.prepareForCurrentMode(reason: "live-start")
            DispatchQueue.main.async { completion(outcome) }
        }
    }

    func stop(completion: ((LiveActivityStopResult) -> Void)? = nil) {
        stateQueue.async {
            self.mode = "off"
            self.queueDepth = 0
            self.lastAcknowledgedAt = nil
            self.motionState = "unknown"
            self.motionConfidence = "unknown"
            self.motionStartedAt = nil
            self.activeFailureSources.removeAll()
            self.healthyRefreshWorkItem?.cancel()
            self.healthyRefreshWorkItem = nil
            self.lastActivityStateData = nil
            self.lastActivityTransitionSignature = nil
            self.lastActivityUpdateAt = nil
            self.clearAlertIncident(reason: "live-stopped", removeDelivered: true)
            self.cancelRenewalNotification()
            if let completion {
                self.stopCompletions.append(completion)
            }
            guard !self.stopInFlight else {
                self.emit("gps:live-activity:end-requested", details: [
                    "coalesced": true
                ])
                return
            }
            self.stopInFlight = true
            if #available(iOS 16.1, *) {
                let finalState = self.state()
                let requestedCount = self.implementation().stop(finalState: finalState) { result in
                    self.stateQueue.async {
                        self.finishStop(result)
                    }
                }
                self.emit("gps:live-activity:end-requested", details: [
                    "activityCount": requestedCount,
                    "coalesced": false
                ])
            } else {
                self.finishStop(.init(requestedCount: 0, remainingCount: 0))
            }
        }
    }

    private func finishStop(_ result: LiveActivityStopResult) {
        stopInFlight = false
        emit(
            "gps:live-activity:ended",
            level: result.remainingCount == 0 ? "info" : "warn",
            details: [
                "activityCount": result.requestedCount,
                "remainingCount": result.remainingCount
            ]
        )
        let completions = stopCompletions
        stopCompletions.removeAll()
        DispatchQueue.main.async {
            completions.forEach { $0(result) }
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

    private func emit(
        _ action: String,
        level: String = "info",
        details: JSObject,
        activityStatus: String? = nil
    ) {
        var event: JSObject = [
            "action": action,
            "level": level,
            "details": details
        ]
        if let activityStatus {
            event["activityStatus"] = activityStatus
        }
        DispatchQueue.main.async { [weak self] in
            self?.eventHandler?(event)
        }
    }

    private func updateActivity(force: Bool = false) {
        guard #available(iOS 16.1, *) else { return }
        let nextState = state()
        guard let encoded = try? JSONEncoder().encode(nextState), encoded != lastActivityStateData else {
            return
        }
        let signature = activityTransitionSignature(nextState)
        let isTransition = signature != lastActivityTransitionSignature
        let elapsed = Date().timeIntervalSince(lastActivityUpdateAt ?? .distantPast)
        if force || isTransition || elapsed >= 60 {
            healthyRefreshWorkItem?.cancel()
            healthyRefreshWorkItem = nil
            implementation().update(state: nextState)
            recordActivitySubmission(nextState)
            return
        }

        guard healthyRefreshWorkItem == nil else { return }
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.healthyRefreshWorkItem = nil
            self.updateActivity(force: true)
        }
        healthyRefreshWorkItem = item
        stateQueue.asyncAfter(deadline: .now() + max(0.1, 60 - elapsed), execute: item)
    }

    @available(iOS 16.1, *)
    private func recordActivitySubmission(_ state: TripCastLiveActivityAttributes.ContentState) {
        lastActivityStateData = try? JSONEncoder().encode(state)
        lastActivityTransitionSignature = activityTransitionSignature(state)
        lastActivityUpdateAt = Date()
    }

    @available(iOS 16.1, *)
    private func activityTransitionSignature(
        _ state: TripCastLiveActivityAttributes.ContentState
    ) -> String {
        [
            state.mode,
            state.health,
            state.message,
            state.motionState ?? "",
            state.motionStartedAt.map { String($0.timeIntervalSince1970) } ?? ""
        ].joined(separator: "|")
    }

    @available(iOS 16.1, *)
    private func implementation() -> AvailableLiveActivityController {
        if let existing = availableImplementation as? AvailableLiveActivityController {
            return existing
        }
        let created = AvailableLiveActivityController { [weak self] action, level, details, activityStatus in
            self?.stateQueue.async {
                self?.emit(
                    action,
                    level: level,
                    details: details,
                    activityStatus: activityStatus
                )
            }
        }
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
    typealias EventHandler = (String, String, JSObject, String?) -> Void

    private var activity: Activity<TripCastLiveActivityAttributes>?
    private var lastState: TripCastLiveActivityAttributes.ContentState?
    private var observedActivityIDs: Set<String> = []
    private let eventHandler: EventHandler

    init(eventHandler: @escaping EventHandler) {
        self.eventHandler = eventHandler
    }

    func startIfNeeded(state: TripCastLiveActivityAttributes.ContentState) -> String {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            eventHandler(
                "gps:live-activity:authorization",
                "warn",
                [
                    "activitiesEnabled": false,
                    "activeActivityCount": Activity<TripCastLiveActivityAttributes>.activities.count
                ],
                "disabled"
            )
            return "disabled"
        }
        if let existing = Activity<TripCastLiveActivityAttributes>.activities.first {
            activity = existing
            observe(existing)
            lastState = nil
            update(state: state)
            return "reused"
        }
        do {
            activity = try Activity.request(
                attributes: TripCastLiveActivityAttributes(startedAt: Date()),
                contentState: state,
                pushType: nil
            )
            if let activity { observe(activity) }
            lastState = state
            return "created"
        } catch {
            activity = nil
            lastState = nil
            let nsError = error as NSError
            eventHandler(
                "gps:live-activity:request-failure",
                "error",
                [
                    "errorDomain": nsError.domain,
                    "errorCode": nsError.code,
                    "activitiesEnabled": ActivityAuthorizationInfo().areActivitiesEnabled,
                    "activeActivityCount": Activity<TripCastLiveActivityAttributes>.activities.count
                ],
                "failed"
            )
            return "failed"
        }
    }

    private func observe(_ activity: Activity<TripCastLiveActivityAttributes>) {
        guard observedActivityIDs.insert(activity.id).inserted else { return }
        Task { [weak self] in
            for await state in activity.activityStateUpdates {
                guard let self else { return }
                let stateName: String
                let activityStatus: String?
                let level: String
                switch state {
                case .active:
                    stateName = "active"
                    activityStatus = nil
                    level = "info"
                case .stale:
                    stateName = "stale"
                    activityStatus = nil
                    level = "warn"
                case .ended:
                    stateName = "ended"
                    activityStatus = "ended"
                    level = "info"
                case .dismissed:
                    stateName = "dismissed"
                    activityStatus = "dismissed"
                    level = "warn"
                @unknown default:
                    stateName = "unknown"
                    activityStatus = nil
                    level = "warn"
                }
                self.eventHandler(
                    "gps:live-activity:lifecycle",
                    level,
                    [
                        "activityId": activity.id,
                        "state": stateName,
                        "activeActivityCount": Activity<TripCastLiveActivityAttributes>.activities.count
                    ],
                    activityStatus
                )
            }
        }
    }

    func update(state: TripCastLiveActivityAttributes.ContentState) {
        guard let activity, state != lastState else { return }
        lastState = state
        Task { await activity.update(using: state) }
    }

    func stop(
        finalState: TripCastLiveActivityAttributes.ContentState,
        completion: @escaping (LiveActivityStopResult) -> Void
    ) -> Int {
        let activities = Activity<TripCastLiveActivityAttributes>.activities
        self.activity = nil
        lastState = nil
        Task {
            for activity in activities {
                await activity.end(using: finalState, dismissalPolicy: .immediate)
            }
            let requestedIDs = Set(activities.map(\.id))
            let remainingCount = Activity<TripCastLiveActivityAttributes>.activities.reduce(0) {
                $0 + (requestedIDs.contains($1.id) ? 1 : 0)
            }
            completion(.init(
                requestedCount: activities.count,
                remainingCount: remainingCount
            ))
        }
        return activities.count
    }
}
