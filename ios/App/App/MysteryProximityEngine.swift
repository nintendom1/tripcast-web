import CoreLocation
import Foundation

struct NativeMysteryMission: Codable, Equatable {
    let mysteryMissionDocumentId: String
    let stablePackId: String
    let linkedMissionId: String
    let lat: Double
    let lon: Double
    let resolveRadiusMeters: Double
    let narration: String
    let priority: Int
    let expiresAt: Double?
    let updatedAt: Double
    var debugOnly: Bool? = nil

    var isDebugOnly: Bool { debugOnly == true }
}

struct NativeMysteryMissionSync: Codable {
    let enabled: Bool
    let revision: Double
    let missions: [NativeMysteryMission]
}

struct MysteryArrival: Equatable {
    let mission: NativeMysteryMission
    let distanceMeters: Double
}

enum MysteryProximityEngine {
    static let maximumFixAge: TimeInterval = 120
    static let maximumHorizontalAccuracy: CLLocationAccuracy = 50

    static func arrivals(
        missions: [NativeMysteryMission],
        location: CLLocation,
        triggeredIDs: Set<String>,
        now: Date = Date()
    ) -> [MysteryArrival] {
        let accuracy = location.horizontalAccuracy
        guard accuracy >= 0,
              accuracy <= maximumHorizontalAccuracy,
              now.timeIntervalSince(location.timestamp) >= 0,
              now.timeIntervalSince(location.timestamp) <= maximumFixAge else { return [] }

        return missions.compactMap { mission -> MysteryArrival? in
            guard !triggeredIDs.contains(mission.mysteryMissionDocumentId),
                  mission.expiresAt.map({ $0 > now.timeIntervalSince1970 * 1_000 }) ?? true else {
                return nil
            }
            let point = CLLocation(latitude: mission.lat, longitude: mission.lon)
            let distance = location.distance(from: point)
            guard distance + accuracy <= mission.resolveRadiusMeters else { return nil }
            return MysteryArrival(mission: mission, distanceMeters: distance)
        }.sorted {
            if $0.distanceMeters != $1.distanceMeters { return $0.distanceMeters < $1.distanceMeters }
            if $0.mission.priority != $1.mission.priority { return $0.mission.priority > $1.mission.priority }
            return $0.mission.stablePackId < $1.mission.stablePackId
        }
    }
}
