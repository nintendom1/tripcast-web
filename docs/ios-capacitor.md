# TripCast iOS (Capacitor) — Deploy & Test

Native iOS shell around the existing web app, so a Traveler can **emit GPS while the phone is
locked / in a pocket**. Built around **free Apple ID signing** (no $99/yr fee), which means the
app is **device-only** and the provisioning profile **expires every 7 days** — re-deploy from
Xcode to keep it alive.

> Capacitor is pinned to the **7.x** line (core/cli/ios 7.6.5, status-bar 7.0.6) to match
> `@capacitor-community/background-geolocation`, whose Swift PM dependency targets Capacitor 7.
> Do not bump to Capacitor 8 until the geolocation plugin ships a Cap 8 build.
>
> Phase 1 (this commit) adds Capacitor config on Windows. The `ios/` native project is generated
> on the Mac (Phase 1 finish) because `cap add ios` requires macOS + Xcode + CocoaPods.

## Prerequisites (Mac)

- macOS with Xcode + Command Line Tools.
- CocoaPods: `sudo gem install cocoapods` (or `brew install cocoapods`).
- A free Apple ID added in Xcode → Settings → Accounts (creates a "Personal Team").
- iPhone connected via cable, Developer Mode enabled (Settings → Privacy & Security).

## One-time setup (Mac, after `git pull`)

First create `.env.capacitor.local` (see "Pointing at prod" below), then:

```bash
cd tripcast-web
npm install
npm run build:cap                # vite --mode capacitor → dist/ with relative paths + prod URL
npx cap add ios                  # generates ios/ native project (macOS only)
npx cap sync ios                 # copies web build + installs pods
```

In Xcode (`npx cap open ios`):
1. Select the **App** target → **Signing & Capabilities**.
2. Team = your Personal Team (free Apple ID). Bundle id matches `capacitor.config.ts`
   (`com.tripcast.app`) — change if Xcode says it is taken.
3. Phase 2 will add the **Location** background mode and Info.plist usage strings here.

## Pointing at prod (required — the phone can't reach localhost)

`.env.local` holds `VITE_CONVEX_URL=http://127.0.0.1:3210` for local dev. On a phone, `127.0.0.1`
is the phone itself, so a native build with that value hangs at sign-in
("Still trying to finish this sign-in…"). The native build must target the **prod cloud**
deployment — the same one the web app uses.

Prod already exists. Its URL is the GitHub Actions **repo variable** `VITE_CONVEX_URL`, consumed by
`.github/workflows/main.yml`. The CI build sets only that one var; `VITE_CONVEX_SITE_URL` is left
unset and auto-derived from it (`mapService.ts`). So the native build just needs the same single
value — no auth env, no site URL.

### Get the prod URL

```bash
cd tripcast-web
gh variable get VITE_CONVEX_URL          # or: gh variable list
```

Or via GitHub web: repo → Settings → Secrets and variables → Actions → Variables tab →
`VITE_CONVEX_URL`.

### One-time: env file for native builds

Create `tripcast-web/.env.capacitor.local` (gitignored; loaded only by the `--mode capacitor`
build, and **overrides** `.env.local`, so dev keeps using localhost):

```
VITE_CONVEX_URL=<value from the GitHub variable>
```

How it connects: Capacitor never reads env files. Only `vite build` does — and it bakes the URL
into `dist/`. The `npm run ios:*` scripts build with `--mode capacitor` (which loads
`.env.capacitor.local` and sets the relative base), then `cap sync` copies `dist/` into the native
project, then `cap run` compiles and launches it. So the env value reaches the phone purely through
the built `dist/`. (Vite precedence: `.env.capacitor.local` > `.env.local`.)

## Routine deploy / weekly refresh (Mac)

Each web change, or whenever the 7-day profile lapses — one command does build + sync + run:

```bash
cd tripcast-web
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
- When Live Trail location is wired (Phase 2), iOS will prompt for permission — choose
  **Allow Always** so it emits with the screen locked.

## Troubleshooting

### "TripCast is No Longer Available"
If the app was working and suddenly shows this error on your iPhone, check these causes:
1. **7-Day Expiry**: Free "Personal Team" provisioning profiles expire every 7 days. You must re-run `npm run ios:run` from your Mac to refresh the signature.
2. **Device Trust**: If you just reinstalled, you may need to go to **Settings → General → VPN & Device Management** and "Trust" your Apple ID developer certificate again.
3. **Build Mismatch**: If you manually edited files in Xcode and then ran `cap sync`, your changes might be in a broken state. Try `npm run ios:run` to do a clean web build and sync.
4. **Network/Cloud URL**: If the app launches but hangs at "Still trying to finish this sign-in...", ensure `VITE_CONVEX_URL` in `.env.capacitor.local` is set to the **prod** URL, not localhost.

## Phase 1 test checklist

- [ ] `npm run build:cap` succeeds; `dist/index.html` uses `./assets/...` paths.
- [ ] `npx cap add ios && npx cap sync ios` complete with no errors (Mac).
- [ ] App launches in the iOS Simulator and the existing TripCast web app renders unchanged
      (map, sheets, auth all work — backend reached over https).
- [ ] App installs and launches on the physical iPhone via `cap run ios`.
- [ ] `npm run validate` passes (regression guard).

Background-GPS emission testing is **Phase 2** (needs the geolocation plugin + Info.plist modes).

## Phase 2 — Background GPS emission

The web code is done: `src/native/locationWatcher.ts` wraps the
`@capacitor-community/background-geolocation` plugin behind a platform guard, and the existing
Traveler location-sharing effect in `src/features/map/TripMap.tsx` uses it on native (web still
uses `navigator.geolocation`). The **LivePill** "LIVE / PAUSED" toggle is the control surface — no
new UI. Remaining work is iOS native config, all on the Mac.

### ⚠️ Info.plist keys are MANDATORY — missing them crashes the app

iOS **hard-terminates** the app (SIGABRT → back to the home screen) the instant it touches Core
Location without these usage strings. It is a native crash *before* any JS runs, so the React error
boundary and debug logging see nothing, and Settings → TripCast shows **no Location row** (iOS only
adds it after the first successful request). If the LIVE toggle crashes to home, this is why.

**Capture the real cause:** connect the iPhone, run the app *from Xcode* (or Window → Devices and
Simulators → device → Open Console), tap LIVE, and read the log — it names the missing key
explicitly ("…must contain an NSLocationWhenInUseUsageDescription key").

### iOS native setup (Mac, one-time)

1. `npx cap sync ios` (installs the plugin pod after `npm install`).
2. In Xcode → **App** target → **Signing & Capabilities** → **+ Capability** → **Background Modes**,
   then check **Location updates**. (Allowed under free signing — it is a background *mode*, not a
   paid entitlement.)
3. Add Info.plist usage strings (Xcode → Info, or edit `ios/App/App/Info.plist`) — paste inside the
   top-level `<dict>`:
   ```xml
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>TripCast shows your live location on the trip map.</string>
   <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
   <string>TripCast keeps sharing your live location with followers while the app is in the background.</string>
   <key>UIBackgroundModes</key>
   <array>
     <string>location</string>
   </array>
   ```
   (Step 2's capability adds the `UIBackgroundModes`/`location` entry; keep it if already present.)
4. Reinstall: `npm run ios:run`. First LIVE tap now shows the iOS prompt → choose **Allow Always**.

### Commit the native project

`ios/` is currently Mac-local only, so the Info.plist fix would be lost on regen. After it works:
`git add ios/ && git commit`. Capacitor's generated `ios/App/.gitignore` plus the repo `.gitignore`
already exclude `Pods/`, `build/`, copied web assets, `Podfile.lock`, and `*.xcuserstate`. Pushing
makes Info.plist versioned and editable from any checkout (including Windows).

> If location is later **denied**, the app now detects `NOT_AUTHORIZED` and opens Settings once
> (via `BackgroundGeolocation.openSettings()`) so you can re-enable it — see `TripMap.tsx`
> `handleError`. This is recovery only; it does not substitute for the mandatory Info.plist keys.

### On-device test (real iPhone — simulator can't truly background-lock GPS)

- [ ] Tap **LIVE** on the HUD; grant **Allow Always** when prompted (Always is required for locked
      emission — "While Using" stops when backgrounded).
- [ ] Confirm the iOS location arrow appears; lock the phone, walk/drive a few hundred meters.
- [ ] In Convex, `liveTrailSamples` rows accrue while locked; a Follower session sees moving points
      via `followerListLiveTrailSamples`.
- [ ] Tap **PAUSED** → emission stops (watcher removed). Server dedup (60s/200m) prevents flooding.
- [ ] Debug log shows `live-trail:native-watch:start/stop` and `live-trail:permission:result`.

## App icon & splash (Phase 3)

The native project currently uses the generic Capacitor scaffold icon. To brand it: drop a
**1024×1024** `assets/icon.png` (no transparency) — see `assets/README.md` — then on the Mac:

```bash
cd tripcast-web
npm run ios:assets          # capacitor-assets generate --ios
npm run ios:run
git add assets/ ios/App/App/Assets.xcassets   # commit sources + generated icons
```

## Notes

- Web deploy is unaffected: a plain `npm run build` (no `CAPACITOR=1`) keeps the
  `/tripcast-web/` GitHub Pages base.
- Free-signing limits: app expires after 7 days, max 3 sideloaded apps per Apple ID, 10 app IDs
  per 7 days. Fine for one personal device.
- If iOS ever blocks background location under free signing (not expected — it is an Info.plist
  background mode, not a paid entitlement), the only fallback is a paid Developer account.
