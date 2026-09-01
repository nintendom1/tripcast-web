import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct TripCastLiveActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var mode: String
        var health: String
        var lastAcknowledgedAt: Date?
        var queueDepth: Int
        var message: String
        var motionState: String?
        var motionStartedAt: Date?
        var snoozeUntil: Date?
    }

    let startedAt: Date
}
