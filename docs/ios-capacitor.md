# TripCast iOS (Capacitor) — Deploy & Test

Native iOS shell around the existing web app, so a Traveler can **emit GPS while the phone is
locked / in a pocket**. Built around **free Apple ID signing** (no $99/yr fee), which means the
app is **device-only** and the provisioning profile **expires every 7 days** — renew and re-deploy
it before the countdown reaches zero.

> Capacitor core, CLI, and iOS are pinned to **8.4.0**. Background location uses
> `@capgo/background-geolocation` 8.0.40. Keep those versions aligned when upgrading the native
> toolchain.
>
> The `ios/` native project is versioned. Do not run `npx cap add ios` in an existing checkout.

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
npm run ios:sync                 # build:cap → copy web assets → install/update pods
```

In Xcode (`npx cap open ios`):
1. Select the **App** target → **Signing & Capabilities**.
2. Team = your Personal Team (free Apple ID). Bundle id matches `capacitor.config.ts`
   (`com.tripcast.app`) — change if Xcode says it is taken.
3. Confirm the committed **Location updates** background mode and location usage strings remain
   present after syncing.

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

Create `tripcast-web/.env.capacitor.local` (gitignored; loaded only by native build scripts,
and **overrides** `.env.local`, so dev keeps using localhost):

```
VITE_CONVEX_URL=<value from the GitHub variable>
DEVELOPMENT_TEAM=<your Apple Team ID>
```

Find your Team ID in Xcode: open `npx cap open ios`, select the **App** target, then check
**Signing & Capabilities** → **Team**. It is the 10-character alphanumeric code next to your
Personal Team.

If `npm run ios:run` fails with `No Account for Team`, the value in `.env.capacitor.local` does
not match an Apple ID account in Xcode. Select your **Personal Team** in Xcode, copy that Team ID
into `.env.capacitor.local`, and do not commit the `DEVELOPMENT_TEAM` line Xcode writes back into
`ios/App/App.xcodeproj/project.pbxproj`.

How it connects: Vite reads `VITE_CONVEX_URL` during `vite build --mode capacitor` and bakes the URL
into `dist/`. The `npm run ios:*` scripts build with `--mode capacitor` (which loads
`.env.capacitor.local` and sets the relative base), then `cap sync` copies `dist/` into the native
project. `npm run ios:run` also reads `DEVELOPMENT_TEAM` locally and passes it directly to
`xcodebuild`, so your personal Apple Team ID does not need to be committed to the Xcode project.
(Vite precedence: `.env.capacitor.local` > `.env.local`.)

## Routine deploy and profile renewal (Mac)

For ordinary web changes, one command builds, syncs, signs, and deploys:

```bash
cd tripcast-web
npm run ios:run                 # = build:cap → cap sync ios → xcodebuild → native-run
# or target a specific device:
npm run ios:run -- --target <device-id>
```

Xcode normally reuses a still-valid cached provisioning profile. An ordinary rebuild therefore
does **not** reset its lifetime to seven days. On native iOS, open Traveler options → Developer and
check **Sideload Profile** for the remaining time and exact expiration embedded in the installed
app. The row is intentionally absent on web, Android, and Follower views.

To deliberately request a new profile and deploy it:

```bash
npm run ios:run -- --refresh-profile --target <device-id>
```

`--refresh-profile` selects only the cached profile matching
`<DEVELOPMENT_TEAM>.com.tripcast.app`, moves it out of Xcode's profile cache during signing, and
restores it automatically if the native build fails. After a successful renewal, the installed
app should report approximately seven days remaining. Use this option near expiration rather than
on every routine build, because renewal requires Apple's provisioning service.

- `npm run ios:sync` (build + sync, no launch) if you prefer to run from Xcode.
- List devices: `npm run ios:run -- --list` or `npx cap run ios --list`.
- First launch on device: **Settings → General → VPN & Device Management** → trust your dev cert.
- If iOS asks you to trust the developer again, it usually means Xcode created or selected a new
  signing certificate. Weekly profile refreshes should not normally require repeating this step.
- If you manually retain an old profile, move it outside
  `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`; Xcode tries to parse every file in
  that directory, including files renamed with a `.backup` suffix.
- On first Live Trail use, iOS prompts for location permission — choose **Allow Always** so it
  emits with the screen locked.

## Native test checklist

- [ ] `npm run build:cap` succeeds; `dist/index.html` uses `./assets/...` paths.
- [ ] `npm run ios:sync` completes with no errors (Mac).
- [ ] App launches in the iOS Simulator and the existing TripCast web app renders unchanged
      (map, sheets, auth all work — backend reached over https).
- [ ] App installs and launches on the physical iPhone via `npm run ios:run`.
- [ ] Traveler Developer options show the embedded profile's actual expiration on physical iOS.
- [ ] `--refresh-profile` renews the profile to approximately seven days and deploys it.
- [ ] `npm run validate` passes (regression guard).

## Adaptive background GPS emission

The native iOS app has two mutually exclusive tracking engines. Adaptive Background GPS is the
default and is
implemented by TripCast in `AdaptiveLocationPlugin.swift` and `AdaptiveLocationService.swift`.
Turning Adaptive Background GPS off in
**Options → Account → Live Trail → Adaptive Background GPS** selects the unchanged
`@capgo/background-geolocation` integration as an in-app rollback path. Web/PWA and non-iOS
builds continue to use their existing browser or legacy behavior. The **LivePill** "LIVE / PAUSED"
toggle remains the explicit sharing control; changing engines never changes that logical Live
choice.

Adaptive tracking begins in **Precise** mode. After approximately five minutes without meaningful
movement, it enters **Power saving** while the
HUD remains LIVE. A 100 m exit region, significant-location changes, and low-accuracy standard
updates give iOS multiple opportunities to report movement. The foreground-started standard
location session remains running throughout Live; mode changes reconfigure that manager in place
instead of stopping and restarting it from a background wake. Automatic Core Location pausing is
disabled; if iOS nevertheless pauses the session, TripCast immediately requests updates again. On
promotion, the service removes the distance filter until a fresh precise fix arrives, then restores
normal precise settings. Calibration temporarily holds precise, high-frequency tracking.

Accepted fixes are sampled and published by native Swift rather than depending on the WebView to
stay executable. Samples are durably queued on-device, sent to Convex in idempotent batches, and
removed only after acknowledgement. The current-location write advances only for a newer sampled
timestamp, so delayed retries cannot move the Traveler backwards. The JavaScript publisher remains
the fallback until native publishing is configured and for the Legacy tracker.

While Live is on, iOS 16.1 and later shows a Lock Screen Live Activity with the current mode, queued
sample count, and a system-updating relative timer from the last server-confirmed breadcrumb. The
configurable stale alert treats a confidently stationary session as healthy even when the last
server-confirmed breadcrumb is old. Moving and uncertain Motion & Fitness states remain alertable if
server confirmation stops. Core Location, authorization, storage, network, and server failures also
remain alertable while stationary, but only after the selected delay so transient failures can recover
quietly. Power Saving is quiet unless an explicit failure is active; Privacy Pause is always quiet.
One persisted notification is sent per unresolved incident. Notifications must be allowed for the
sound alert; the Live Activity timer remains useful when alerts are denied. Open TripCast before the
Live Activity's eight-hour system lifetime expires to renew it.

The alert does not control retention. Accepted fixes remain in the durable on-device queue during a
connection outage, retry in idempotent batches, and are removed only after backend acknowledgement.
Ordinary queued or in-flight samples are not themselves failures.

The native service persists the Live request, current adaptive mode, stationary anchor, and timing
metadata. A location-triggered iOS relaunch reconstructs that state before the Capacitor bridge is
available, and the latest event is retained until JavaScript reattaches. Explicit Live-off,
sign-out, Emergency Reset, and cloaking auto-shutoff clear all native location services and the
temporary region.

### iOS wake-up limits

iOS controls the effective region cushion, significant-change threshold, delivery timing, and
background scheduling. Treat the 100 m region as an input, not a promise that wake-up will occur at
exactly 100 m or immediately. Background App Refresh, Low Power Mode, permission precision, and
system conditions can all affect delivery.

- When TripCast is merely backgrounded or its WebView is suspended, the foreground-started native
  Core Location session, native sampler, durable queue, and native publisher continue independently
  of JavaScript.
- If iOS terminates TripCast in the background for memory or system pressure, a region exit or
  significant-location event may relaunch it because the app declares location background mode.
  The native service restores the persisted Live request and queue before the WebView loads. This
  relaunch remains an iOS scheduling opportunity, not a delivery-time guarantee.
- If the user force-quits TripCast from the app switcher, iOS intentionally suppresses reliable
  background location relaunch until the app is opened manually. The Lock Screen timer and stale
  notification are secondary clues for deciding when to do that.

### ⚠️ Info.plist keys are MANDATORY — missing them crashes the app

iOS **hard-terminates** the app (SIGABRT → back to the home screen) the instant it touches Core
Location without these usage strings. It is a native crash *before* any JS runs, so the React error
boundary and debug logging see nothing, and Settings → TripCast shows **no Location row** (iOS only
adds it after the first successful request). If the LIVE toggle crashes to home, this is why.

**Capture the real cause:** connect the iPhone, run the app *from Xcode* (or Window → Devices and
Simulators → device → Open Console), tap LIVE, and read the log — it names the missing key
explicitly ("…must contain an NSLocationWhenInUseUsageDescription key").

### iOS native configuration

The native project already commits the plugin pod, **Location updates** background mode, and these
Info.plist entries:

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

After dependency changes, run `npm run ios:sync` and confirm this configuration remains present.
Reinstall with `npm run ios:run`; the first LIVE tap shows the iOS prompt → choose
**Allow Always**.

### Native project commits

Review native diffs after Xcode or `cap sync` changes. Commit intentional project, plist, pod, or
asset updates, but do not commit a personal `DEVELOPMENT_TEAM` value written into
`ios/App/App.xcodeproj/project.pbxproj`. Generated build products and user state remain ignored.

> If location is later **denied**, the app now detects `NOT_AUTHORIZED` and opens Settings once
> (via `BackgroundGeolocation.openSettings()`) so you can re-enable it — see `TripMap.tsx`
> `handleError`. This is recovery only; it does not substitute for the mandatory Info.plist keys.

### On-device test (real iPhone — simulator can't truly background-lock GPS)

- [ ] Confirm Adaptive Background GPS defaults on while LIVE remains off on a fresh install.
- [ ] Tap **LIVE** on the HUD; grant **Allow Always** when prompted (Always is required for locked
      emission — "While Using" stops when backgrounded).
- [ ] Confirm Adaptive Background GPS reports **Precise** and a Follower receives updates.
- [ ] Remain stationary for five minutes; confirm **Power saving**, the green Compass inset, and
      unchanged LIVE text in Meadow and Constellation.
- [ ] Lock the phone, walk/drive, and record the observed wake distance/time. Confirm the next
      emitted event is a fresh precise fix and Followers resume receiving updates.
- [ ] In Convex, `liveTrailSamples` rows accrue while locked; a Follower session sees the latest
      permitted point via `getLatestLiveTrailSample`.
- [ ] Turn Adaptive GPS off while LIVE; confirm **Legacy** without a follower-visible stop. Turn it
      back on and confirm **Precise** with a fresh idle window.
- [ ] Remain stationary beyond the configured alert delay and confirm an old acknowledgement alone
      does not notify. Then move with delivery blocked and confirm exactly one delayed alert.
- [ ] Deny Motion & Fitness and confirm uncertain motion still alerts after the configured delay when
      server confirmation stops.
- [ ] Trigger Core Location/authorization and publishing failures while stationary. Confirm transient
      failures that recover before the delay stay quiet and sustained failures notify once.
- [ ] Stay offline while moving, confirm samples remain queued, reconnect, and verify the queue drains
      to Convex exactly once before the incident clears.
- [ ] Confirm the Lock Screen Live Activity timer resets after a server acknowledgement, and that
      Privacy Pause, LIVE off, and the alert's Off setting cancel pending notifications.
- [ ] Tap **PAUSED** → native acquisition and publishing stop and the queued samples are cleared.
- [ ] Exercise denied/reduced accuracy, Background App Refresh off, Low Power Mode, calibration,
      cloaking, sign-out, Emergency Reset, OS location relaunch, and normal foreground/background.
- [ ] GPS Trace shows watcher start, adaptive mode changes, callbacks, and publish acknowledgements.
      Adaptive mode entries include a transition reason such as `stationary-timeout`,
      `stationary-location`, `low-power-location`, or `region-exit`. Native publishing adds redacted
      queued, attempt, acknowledgement, retry, and queue-depth events without coordinates or tokens.

### Battery comparison

Use matched stationary runs on the same physical iPhone in Xcode Instruments: first Legacy, then
Adaptive under the same battery, radio, permission, and environment conditions. Detach the debugger
for the final observation. After Adaptive enters Power saving, verify there is no sustained
high-accuracy session and that location energy impact is materially lower than Legacy. Record the
observed movement wake distance and elapsed time rather than treating either as fixed.

### Diagnosing a locked-screen delivery stall

The iOS location indicator shows that location services are active; it does not prove that
JavaScript callbacks or Convex writes are continuing.

1. Open Traveler Options → Developer → Dev Tools.
2. Enable Debug Logging, select **GPS Trace**, enable location redaction, and clear old logs.
3. Start LIVE and confirm watcher-start, callback, and publish-acknowledgement entries.
4. Run detached from Xcode, lock the phone, remain stationary long enough to reproduce the stall,
   then move at least 500 m without opening TripCast or another navigation app.
5. Foreground TripCast once and immediately choose **Copy LLM Summary** before toggling LIVE.
6. Repeat under otherwise matching movement, battery, Low Power Mode, and timing conditions while
   Google Maps navigation is active.
7. Optionally repeat while attached to Xcode. If only the attached run works, record that the
   debugger masks normal suspension; it does not prove a Core Location pause.

Interpret the trace by the last stage that continues:

- An unexpected watcher-stop entry points to TripCast lifecycle cleanup.
- Continued callbacks with publish failures point to WebView, network, or Convex delivery.
- Publish acknowledgements with stale Followers point to backend freshness or read behavior.
- Missing callbacks while the watcher remains started narrows the boundary to native acquisition
  or native-to-JavaScript delivery. This black-box trace cannot distinguish those two.

Raw JSON remains available as a diagnostic attachment for deeper analysis. The LLM summary is the
recommended text artifact and is capped at 64 KiB.

## Regenerating the app icon and splash

The versioned sources are in `assets/`; see `assets/README.md`. To regenerate the iOS asset
catalog on the Mac:

```bash
cd tripcast-web
npm run ios:assets          # capacitor-assets generate --ios
npm run ios:run
git add assets/ ios/App/App/Assets.xcassets   # commit sources + generated icons
```

## Notes

- Web deploy is unaffected: a plain `npm run build` uses the `/tripcast-web/` GitHub Pages base;
  `build:cap` selects Capacitor mode and a relative asset base.
- Free-signing limits: app expires after 7 days, max 3 sideloaded apps per Apple ID, 10 app IDs
  per 7 days. Fine for one personal device.
- If iOS ever blocks background location under free signing (not expected — it is an Info.plist
  background mode, not a paid entitlement), the only fallback is a paid Developer account.
