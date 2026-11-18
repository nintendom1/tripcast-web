import Foundation

enum StationaryTimerDelay {
    /// Existing floor: once the idle window has passed with a fix, the timer fires almost immediately.
    static let minimum: TimeInterval = 0.1
    /// Power-saving cannot start without a fix (no anchor, no last precise fix), so re-arming at the
    /// minimum is a 10/s loop on the main queue. A 30 s re-check costs 1/300 of that and delays
    /// power-saving by at most 30 s after the first fix arrives.
    static let noAnchorRetry: TimeInterval = 30

    static func seconds(
        now: Date,
        lastMeaningfulAt: Date,
        interval: TimeInterval,
        hasAnchor: Bool
    ) -> TimeInterval {
        let remaining = interval - now.timeIntervalSince(lastMeaningfulAt)
        if remaining <= 0, !hasAnchor { return noAnchorRetry }
        return max(minimum, remaining)
    }
}
