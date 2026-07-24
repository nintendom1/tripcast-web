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
        guard
            let profileURL = Bundle.main.url(
                forResource: "embedded",
                withExtension: "mobileprovision"
            ),
            let profileData = try? Data(contentsOf: profileURL),
            let plistData = extractPlist(from: profileData),
            let plist = try? PropertyListSerialization.propertyList(
                from: plistData,
                options: [],
                format: nil
            ) as? [String: Any],
            let expirationDate = plist["ExpirationDate"] as? Date
        else {
            call.resolve()
            return
        }

        call.resolve([
            "expiresAtMs": expirationDate.timeIntervalSince1970 * 1_000
        ])
    }

    private func extractPlist(from profileData: Data) -> Data? {
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
