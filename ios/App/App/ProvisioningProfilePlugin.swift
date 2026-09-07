import Foundation
import Capacitor

@objc(ProvisioningProfilePlugin)
public class ProvisioningProfilePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProvisioningProfilePlugin"
    public let jsName = "ProvisioningProfile"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getExpiration", returnType: CAPPluginReturnPromise)
    ]

    @objc func getExpiration(_ call: CAPPluginCall) {
        call.resolve(InstalledProvisioningProfiles.snapshot)
    }
}

// The installed profiles are immutable for the life of this process. Share the
// same reader between Developer options and Live Activity diagnostics.
enum InstalledProvisioningProfiles {
    static let snapshot: JSObject = {
        let app = readProfile(bundle: Bundle.main)
        let extensionURL = Bundle.main.builtInPlugInsURL?.appendingPathComponent("TripCastLiveActivity.appex")
        let activityBundle = extensionURL.flatMap { Bundle(url: $0) }
        let activity = readProfile(bundle: activityBundle)
        var result: JSObject = [
            "appProfileStatus": app.status,
            "activityExtensionPresent": activityBundle != nil,
            "activityProfileStatus": activity.status
        ]
        if let expiration = app.expiration { result["expiresAtMs"] = expiration.timeIntervalSince1970 * 1_000 }
        if let expiration = activity.expiration { result["activityExpiresAtMs"] = expiration.timeIntervalSince1970 * 1_000 }
        return result
    }()

    static func diagnostics() -> JSObject {
        var result = snapshot
        result["appVersion"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        result["appBuild"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
        result["iosVersion"] = ProcessInfo.processInfo.operatingSystemVersionString
        let now = Date().timeIntervalSince1970 * 1_000
        if let expiration = snapshot["expiresAtMs"] as? Double { result["appProfileExpired"] = expiration <= now }
        if let expiration = snapshot["activityExpiresAtMs"] as? Double { result["activityProfileExpired"] = expiration <= now }
        return result
    }

    private static func readProfile(bundle: Bundle?) -> (status: String, expiration: Date?) {
        guard let profileURL = bundle?.url(forResource: "embedded", withExtension: "mobileprovision") else {
            return ("missing", nil)
        }
        guard let profileData = try? Data(contentsOf: profileURL),
            let plistData = extractPlist(from: profileData),
            let plist = try? PropertyListSerialization.propertyList(
                from: plistData,
                options: [],
                format: nil
            ) as? [String: Any],
            let expirationDate = plist["ExpirationDate"] as? Date
        else {
            return ("unreadable", nil)
        }

        return ("available", expirationDate)
    }

    private static func extractPlist(from profileData: Data) -> Data? {
        guard
            let startMarker = "<?xml".data(using: .utf8),
            let endMarker = "</plist>".data(using: .utf8),
            let startRange = profileData.range(of: startMarker),
            let endRange = profileData.range(
                of: endMarker,
                in: startRange.lowerBound..<profileData.endIndex
            )
        else {
            return nil
        }

        return profileData.subdata(
            in: startRange.lowerBound..<endRange.upperBound
        )
    }
}
