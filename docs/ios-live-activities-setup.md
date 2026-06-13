# iOS Live Activities & Dynamic Island Setup

To enable the Dynamic Island progress meter for pin uploads, follow these manual steps in Xcode.

## 1. Add a Widget Extension Target
1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the **App** project in the Project Navigator.
3. Click **File > New > Target...**
4. Select **Widget Extension** and click **Next**.
5. Product Name: `UploadWidget`
6. **Important**: Uncheck "Include Configuration Intent".
7. Check "Include Live Activity".
8. Click **Finish**.
9. If asked to "Activate 'UploadWidgetExtension' scheme?", click **Activate**.

## 2. Share Attributes
The `UploadAttributes` must be accessible to both the Main App and the Widget Extension.
1. Move the `UploadAttributes` struct definition into a new file: `ios/App/App/UploadAttributes.swift`.
2. In the File Inspector (right sidebar), ensure both **App** and **UploadWidgetExtension** are checked under **Target Membership**.

## 3. Implement the Widget
1. Replace the contents of `ios/App/UploadWidget/UploadWidget.swift` with the code provided in `ios/App/App/UploadWidget.swift`.
2. Ensure `Info.plist` in your main App target has `NSSupportsLiveActivities` set to `YES`.

## Capacitor Integration
The `LiveActivityPlugin.swift` provided in `ios/App/App/` acts as the bridge. To use it in TypeScript:

```typescript
import { registerPlugin } from '@capacitor/core';

interface LiveActivityPlugin {
  isAvailable(): Promise<{ value: boolean }>;
  startUploadActivity(options: { title: string; status: string }): Promise<{ id: string }>;
  updateUploadActivity(options: { id: string; status: string; progress: number }): Promise<void>;
  endUploadActivity(options: { id: string }): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');
```
