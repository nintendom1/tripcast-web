# iOS Live Activities Setup

Live Activities allow TripCast to show upload progress and status in the Dynamic Island and on the Lock Screen. This requires a native iOS Widget Extension and a Capacitor bridge.

## 1. Prerequisites
- A Mac with Xcode 15+.
- The iOS project generated (`npx cap add ios`).
- A paid Apple Developer account is **required** for Live Activities (they do not work with free "Personal Team" signing).

## 2. Add the Widget Extension Target
1. Open the project in Xcode: `npx cap open ios`.
2. Select **File > New > Target...**.
3. Choose **Widget Extension**.
4. Name it `TripCastWidget` (or similar).
5. **Uncheck** "Include Configuration Intent" (we use a simple progress display).
6. Click **Finish**. When asked to "Activate TripCastWidgetExtension scheme", click **Activate**.

## 3. Configure Capabilities
1. Select the **App** target (not the Widget target).
2. Go to **Signing & Capabilities**.
3. Ensure **Supports Live Activities** is added (if not, click **+ Capability** and add it).
4. Do the same for the **Widget** target.

## 4. Info.plist
In `ios/App/App/Info.plist`, ensure the following key is present:
```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

## 5. Implement the Capacitor Bridge
The frontend expects a plugin named `LiveActivity`. If `ios/App/App/LiveActivityPlugin.swift` is missing, you must recreate it.

### LiveActivityPlugin.swift
Create this file in `ios/App/App/` and add it to the App target:

```swift
import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin {

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["value": false])
        }
    }

    // Note: You must define ActivityAttributes in a shared file
    // accessible to both the App and the Widget target.

    @objc func startUploadActivity(_ call: CAPPluginCall) {
        // Implementation logic for ActivityKit start
        call.resolve(["id": "dummy-id"])
    }

    @objc func updateUploadActivity(_ call: CAPPluginCall) {
        // Implementation logic for ActivityKit update
        call.resolve()
    }

    @objc func endUploadActivity(_ call: CAPPluginCall) {
        // Implementation logic for ActivityKit end
        call.resolve()
    }
}
```

### LiveActivityPlugin.m
Create this file in `ios/App/App/` to expose the methods to Capacitor:

```objc
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
           CAP_PLUGIN_METHOD(isAvailable, CAP_METHOD_CONFIRMED);
           CAP_PLUGIN_METHOD(startUploadActivity, CAP_METHOD_CONFIRMED);
           CAP_PLUGIN_METHOD(updateUploadActivity, CAP_METHOD_CONFIRMED);
           CAP_PLUGIN_METHOD(endUploadActivity, CAP_METHOD_CONFIRMED);
)
```

## 6. Shared Attributes
You must define your `ActivityAttributes` in a way that both the main App and the Widget Extension can see them. Usually, this means creating a file like `UploadAttributes.swift` and checking both targets in the **File Inspector > Target Membership**.

```swift
import ActivityKit
import Foundation

struct UploadAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String
        var progress: Double
    }
    var title: String
}
```

## 7. Widget UI
In your `TripCastWidget.swift`, implement the `ActivityConfiguration` to define how the Dynamic Island and Lock Screen look.

---
**Note:** As of the current commit, the native bridge files (`.swift`/`.m`) may be missing from the repository. If you are a developer setting this up for the first time, you will need to implement the Swift logic to interact with `ActivityKit`.
