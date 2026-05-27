# TripCast iOS (Capacitor) — Deploy & Test

Native iOS shell around the existing web app, so a Traveler can **emit GPS while the phone is
locked / in a pocket**. Built around **free Apple ID signing** (no $99/yr fee), which means the
app is **device-only** and the provisioning profile **expires every 7 days** — re-deploy from
Xcode to keep it alive.

> Phase 1 (this commit) adds Capacitor config on Windows. The `ios/` native project is generated
> on the Mac (Phase 1 finish) because `cap add ios` requires macOS + Xcode + CocoaPods.

## Prerequisites (Mac)

- macOS with Xcode + Command Line Tools.
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`).
- A free Apple ID added in Xcode → Settings → Accounts (creates a "Personal Team").
- iPhone connected via cable, Developer Mode enabled (Settings → Privacy & Security).

## One-time setup (Mac, after `git pull`)

```bash
cd tripcast-web
npm install
CAPACITOR=1 npm run build        # produces dist/ with relative asset paths
npx cap add ios                  # generates ios/ native project (macOS only)
npx cap sync ios                 # copies web build + installs pods
```

In Xcode (`npx cap open ios`):
1. Select the **App** target → **Signing & Capabilities**.
2. Team = your Personal Team (free Apple ID). Bundle id matches `capacitor.config.ts`
   (`com.tripcast.app`) — change if Xcode says it is taken.
3. Phase 2 will add the **Location** background mode and Info.plist usage strings here.

## Routine deploy / weekly refresh (Mac)

Each web change, or whenever the 7-day profile lapses:

```bash
cd tripcast-web
CAPACITOR=1 npm run build
npx cap sync ios
npx cap run ios --target <device-id>   # build + install in one step
```

- List devices: `npx cap run ios --list`.
- First launch on device: **Settings → General → VPN & Device Management** → trust your dev cert.
- When Live Trail location is wired (Phase 2), iOS will prompt for permission — choose
  **Allow Always** so it emits with the screen locked.

## Phase 1 test checklist

- [ ] `CAPACITOR=1 npm run build` succeeds; `dist/index.html` uses `./assets/...` paths.
- [ ] `npx cap add ios && npx cap sync ios` complete with no errors (Mac).
- [ ] App launches in the iOS Simulator and the existing TripCast web app renders unchanged
      (map, sheets, auth all work — backend reached over https).
- [ ] App installs and launches on the physical iPhone via `cap run ios`.
- [ ] `npm run validate` passes (regression guard).

Background-GPS emission testing is **Phase 2** (needs the geolocation plugin + Info.plist modes).

## Notes

- Web deploy is unaffected: a plain `npm run build` (no `CAPACITOR=1`) keeps the
  `/tripcast-web/` GitHub Pages base.
- Free-signing limits: app expires after 7 days, max 3 sideloaded apps per Apple ID, 10 app IDs
  per 7 days. Fine for one personal device.
- If iOS ever blocks background location under free signing (not expected — it is an Info.plist
  background mode, not a paid entitlement), the only fallback is a paid Developer account.
