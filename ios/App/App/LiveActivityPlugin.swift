import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {

    // Check if Live Activities are available
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["value": false])
        }
    }

    // Start a new Live Activity for a pin upload
    @objc func startUploadActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities not supported")
            return
        }

        let title = call.getString("title") ?? "New Pin"
        let status = call.getString("status") ?? "Uploading..."

        // This requires an ActivityAttributes struct defined in your app/extension
        // Since we can't easily add it to the main target via script,
        // we assume it's there or provide it in documentation.

        /*
        let attributes = UploadAttributes(name: title)
        let state = UploadAttributes.ContentState(status: status, progress: 0.1)

        do {
            let activity = try Activity.request(attributes: attributes, contentState: state)
            call.resolve(["id": activity.id])
        } catch {
            call.reject("Failed to start activity: \(error.localizedDescription)")
        }
        */

        call.resolve(["message": "Live Activity started (Stub)"])
    }
}
