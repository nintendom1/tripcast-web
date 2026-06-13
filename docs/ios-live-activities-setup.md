# iOS Live Activities & Dynamic Island — Future Work

> **Status: Deferred.** The TypeScript bridge skeleton in `BackgroundSaveProvider.tsx` is in
> place and gracefully no-ops when the plugin is not registered. The Swift implementation
> requires a dedicated iOS PR with manual Xcode target setup.

## What exists today

`BackgroundSaveProvider.tsx` already calls the `LiveActivity` Capacitor plugin at key points
(upload start, progress, end). If the plugin is not registered (e.g. web, simulator, or before
the Xcode target is set up), all calls are silently caught and ignored.

## What the iOS PR needs to do

### 1. Add a Widget Extension Target
1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the **App** project in the Project Navigator.
3. Click **File > New > Target...**
4. Select **Widget Extension** and click **Next**.
5. Product Name: `UploadWidget`
6. **Important**: Uncheck "Include Configuration Intent".
7. Check "Include Live Activity".
8. Click **Finish**.
9. If asked to "Activate 'UploadWidgetExtension' scheme?", click **Activate**.

### 2. Add `UploadAttributes.swift`

Create `ios/App/App/UploadAttributes.swift` and add both App + UploadWidgetExtension to
**Target Membership**:

```swift
import ActivityKit

struct UploadAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String
        var progress: Double // 0.0 to 1.0
    }
    var name: String
}
```

### 3. Implement `LiveActivityPlugin.swift`

Add `ios/App/App/LiveActivityPlugin.swift` to the App target:

```swift
import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {
    private var currentActivity: Any? // Activity<UploadAttributes>

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["value": false])
        }
    }

    @objc func startUploadActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.reject("Not supported"); return }
        let title = call.getString("title") ?? "New Pin"
        let status = call.getString("status") ?? "Uploading..."
        let attributes = UploadAttributes(name: title)
        let state = UploadAttributes.ContentState(status: status, progress: 0.1)
        do {
            let activity = try Activity.request(attributes: attributes, contentState: state)
            currentActivity = activity
            call.resolve(["id": activity.id])
        } catch {
            call.reject("Failed: \(error.localizedDescription)")
        }
    }

    @objc func updateUploadActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let act = currentActivity as? Activity<UploadAttributes> else {
            call.resolve(); return
        }
        let status = call.getString("status") ?? ""
        let progress = call.getDouble("progress") ?? 0
        Task { await act.update(using: .init(status: status, progress: progress)) }
        call.resolve()
    }

    @objc func endUploadActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let act = currentActivity as? Activity<UploadAttributes> else {
            call.resolve(); return
        }
        Task { await act.end(dismissalPolicy: .immediate) }
        currentActivity = nil
        call.resolve()
    }
}
```

### 4. Register the plugin in `AppDelegate.swift`

```swift
CAPBridge.registerPlugin(LiveActivityPlugin.self)
```

### 5. Widget UI

Create `ios/App/UploadWidget/UploadWidget.swift` with a `ActivityConfiguration(for: UploadAttributes.self)`
body that renders the lock screen and Dynamic Island compact/expanded/minimal views.

### 6. `Info.plist`

Add `NSSupportsLiveActivities = YES` to the main App target's `Info.plist`.
