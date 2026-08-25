import ActivityKit
import AppIntents
import Foundation

enum MysteryAudioPreference {
    // LiveActivityIntent executes in the app process, so this needs no App Group container.
    static let mutedKey = "tripcast.mysteryAudioMuted"
    static let changedNotification = "com.tripcast.mystery-audio-changed" as CFString
}

@available(iOS 17.0, *)
struct SetMysteryAudioMutedIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Set Mystery audio"
    static var description = IntentDescription("Mutes or unmutes automatic Mystery Mission narration.")

    @Parameter(title: "Muted") var muted: Bool

    init() {}
    init(muted: Bool) { self.muted = muted }

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(muted, forKey: MysteryAudioPreference.mutedKey)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(MysteryAudioPreference.changedNotification),
            nil,
            nil,
            true
        )
        return .result()
    }
}

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
        var narrationAvailable: Bool
        var mysteryAudioMuted: Bool

        init(
            mode: String,
            health: String,
            lastAcknowledgedAt: Date?,
            queueDepth: Int,
            message: String,
            motionState: String?,
            motionStartedAt: Date?,
            narrationAvailable: Bool = false,
            mysteryAudioMuted: Bool = false
        ) {
            self.mode = mode
            self.health = health
            self.lastAcknowledgedAt = lastAcknowledgedAt
            self.queueDepth = queueDepth
            self.message = message
            self.motionState = motionState
            self.motionStartedAt = motionStartedAt
            self.narrationAvailable = narrationAvailable
            self.mysteryAudioMuted = mysteryAudioMuted
        }

        private enum CodingKeys: String, CodingKey {
            case mode, health, lastAcknowledgedAt, queueDepth, message
            case motionState, motionStartedAt, narrationAvailable, mysteryAudioMuted
        }

        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            mode = try values.decode(String.self, forKey: .mode)
            health = try values.decode(String.self, forKey: .health)
            lastAcknowledgedAt = try values.decodeIfPresent(Date.self, forKey: .lastAcknowledgedAt)
            queueDepth = try values.decode(Int.self, forKey: .queueDepth)
            message = try values.decode(String.self, forKey: .message)
            motionState = try values.decodeIfPresent(String.self, forKey: .motionState)
            motionStartedAt = try values.decodeIfPresent(Date.self, forKey: .motionStartedAt)
            narrationAvailable = try values.decodeIfPresent(Bool.self, forKey: .narrationAvailable) ?? false
            mysteryAudioMuted = try values.decodeIfPresent(Bool.self, forKey: .mysteryAudioMuted) ?? false
        }
    }

    let startedAt: Date
}
