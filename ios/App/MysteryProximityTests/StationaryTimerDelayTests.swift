import XCTest

final class StationaryTimerDelayTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let interval: TimeInterval = 300

    private func delay(elapsed: TimeInterval, hasAnchor: Bool) -> TimeInterval {
        StationaryTimerDelay.seconds(
            now: now,
            lastMeaningfulAt: now.addingTimeInterval(-elapsed),
            interval: interval,
            hasAnchor: hasAnchor
        )
    }

    func testAnchorBeforeIntervalReturnsRemaining() {
        XCTAssertEqual(delay(elapsed: 100, hasAnchor: true), 200, accuracy: 0.001)
    }

    func testAnchorAfterIntervalKeepsExistingMinimum() {
        XCTAssertEqual(delay(elapsed: 400, hasAnchor: true), 0.1, accuracy: 0.0001)
    }

    func testNoAnchorAfterIntervalRetriesAfterThirtySeconds() {
        XCTAssertEqual(delay(elapsed: 400, hasAnchor: false), 30, accuracy: 0.0001)
        XCTAssertEqual(delay(elapsed: 300, hasAnchor: false), 30, accuracy: 0.0001)
    }

    func testNoAnchorBeforeIntervalReturnsRemaining() {
        XCTAssertEqual(delay(elapsed: 100, hasAnchor: false), 200, accuracy: 0.001)
    }

    func testNeverBelowMinimum() {
        for elapsed in [0.0, 299.95, 300, 301, 10_000] {
            for hasAnchor in [true, false] {
                XCTAssertGreaterThanOrEqual(delay(elapsed: elapsed, hasAnchor: hasAnchor), 0.1)
            }
        }
    }
}
