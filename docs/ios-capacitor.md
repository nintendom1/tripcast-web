# TripCast iOS (Capacitor) — Deploy & Test

Native iOS shell around the existing web app, so a Traveler can **emit GPS while the phone is
locked / in a pocket**. Built around **free Apple ID signing** (no $99/yr fee), which means the
app is **device-only** and the provisioning profile **expires every 7 days** — re-deploy from
Xcode to keep it alive.

> Capacitor is pinned to the **7.x** line (core/cli/ios 7.6.5, status-bar 7.0.6) to match
> `@capacitor-community/background-geolocation`, whose Swift PM dependency targets Capacitor 7.
> Do not bump to Capacitor 8 until the geolocation plugin ships a Cap 8 build.

## Prerequisites (Mac)

- macOS with Xcode + Command Line Tools.
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`).
- A free Apple ID added in Xcode → Settings → Accounts (creates a "Personal Team").
- iPhone connected via cable, Developer Mode enabled (Settings → Privacy & Security).

## Setup & Deployment (Mac)

The native `ios/` project is already committed to the repository. To build and run:

1. **Env File**: Create `tripcast-web/.env.capacitor.local` (gitignored). It must point to the **production** Convex URL because the phone cannot reach `localhost`:
   ```
   VITE_CONVEX_URL=<prod-convex-url>
   ```
2. **Install & Sync**:
   ```bash
   cd tripcast-web
   npm install
   npm run ios:run
   ```

### Understanding the Commands

| Command | Purpose |
|---|---|
| `npm run build:cap` | Compiles the React app specifically for Capacitor. Uses `vite --mode capacitor` to ensure asset paths are relative (`./assets`) and loads `.env.capacitor.local`. |
| `npm run ios:assets` | Generates required iOS App Icons and Splash Screens from the source files in `assets/`. |
| `npx cap sync ios` | Copies the web build (`dist/`) into the iOS project and updates any native dependencies (CocoaPods). |
| `npx cap run ios` | Compiles the native Swift code, signs the app, and installs/launches it on a connected device or simulator. |
| `npm run ios:run` | A convenience script that runs `build:cap`, `sync ios`, and `run ios` in sequence. |

- List devices: `npx cap run ios --list`.
- First launch on device: **Settings → General → VPN & Device Management** → trust your dev cert.

## Background GPS

The app uses `@capacitor-community/background-geolocation` for Live Trail tracking.

### ⚠️ Info.plist keys are MANDATORY
iOS will crash the app if it tries to access location without these strings in `ios/App/App/Info.plist`:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes` containing `location`

These are already committed, but if you regen the project, ensure they are present.

### On-device test
- Tap **LIVE** on the HUD; grant **Allow Always** when prompted.
- Lock the phone and walk a few hundred meters.
- Verify `liveTrailSamples` are accruing in the backend.

## Troubleshooting

### "TripCast is No Longer Available"
If the app was working and suddenly shows this error on your iPhone, check these causes:
1. **7-Day Expiry**: Free "Personal Team" provisioning profiles expire every 7 days. You must re-run `npm run ios:run` from your Mac to refresh the signature.
2. **Device Trust**: If you just reinstalled, you may need to go to **Settings → General → VPN & Device Management** and "Trust" your Apple ID developer certificate again.
3. **Build Mismatch**: If you manually edited files in Xcode and then ran `cap sync`, your changes might be in a broken state. Try `npm run ios:run` to do a clean web build and sync.
4. **Network/Cloud URL**: If the app launches but hangs at "Still trying to finish this sign-in...", ensure `VITE_CONVEX_URL` in `.env.capacitor.local` is set to the **prod** URL, not localhost.

## Notes
- Free-signing limits: app expires after 7 days, max 3 sideloaded apps per Apple ID.
- To brand the app: update `assets/icon.png` (1024x1024) and run `npm run ios:assets`.
