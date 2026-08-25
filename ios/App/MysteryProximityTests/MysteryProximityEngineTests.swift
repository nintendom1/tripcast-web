import CoreLocation
import XCTest

final class MysteryProximityEngineTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func mission(
        id: String = "m1",
        lat: Double = 47.6100,
        lon: Double = -122.3300,
        radius: Double = 75,
        priority: Int = 0
    ) -> NativeMysteryMission {
        .init(
            mysteryMissionDocumentId: id,
            stablePackId: id,
            linkedMissionId: "linked-\(id)",
            lat: lat,
            lon: lon,
            resolveRadiusMeters: radius,
            narration: "Hidden reveal",
            priority: priority,
            expiresAt: nil,
            updatedAt: now.timeIntervalSince1970 * 1_000
        )
    }

    private func fix(
        lat: Double = 47.6100,
        lon: Double = -122.3300,
        accuracy: Double = 10,
        age: TimeInterval = 0
    ) -> CLLocation {
        CLLocation(
            coordinate: .init(latitude: lat, longitude: lon),
            altitude: 0,
            horizontalAccuracy: accuracy,
            verticalAccuracy: -1,
            timestamp: now.addingTimeInterval(-age)
        )
    }

    func testInsideAndOutsideRadius() {
        XCTAssertEqual(MysteryProximityEngine.arrivals(
            missions: [mission()], location: fix(), triggeredIDs: [], now: now
        ).map(\.mission.mysteryMissionDocumentId), ["m1"])
        XCTAssertTrue(MysteryProximityEngine.arrivals(
            missions: [mission(radius: 5)], location: fix(), triggeredIDs: [], now: now
        ).isEmpty)
    }

    func testRejectsPoorAccuracyStaleAndDuplicateFixes() {
        XCTAssertTrue(MysteryProximityEngine.arrivals(
            missions: [mission()], location: fix(accuracy: 51), triggeredIDs: [], now: now
        ).isEmpty)
        XCTAssertTrue(MysteryProximityEngine.arrivals(
            missions: [mission()], location: fix(age: 121), triggeredIDs: [], now: now
        ).isEmpty)
        XCTAssertTrue(MysteryProximityEngine.arrivals(
            missions: [mission()], location: fix(), triggeredIDs: ["m1"], now: now
        ).isEmpty)
    }

    func testSimultaneousCandidatesSortDeterministically() {
        let missions = [
            mission(id: "b", priority: 1),
            mission(id: "a", priority: 1),
            mission(id: "high", priority: 10),
        ]
        XCTAssertEqual(MysteryProximityEngine.arrivals(
            missions: missions, location: fix(), triggeredIDs: [], now: now
        ).map(\.mission.stablePackId), ["high", "a", "b"])
    }
}
