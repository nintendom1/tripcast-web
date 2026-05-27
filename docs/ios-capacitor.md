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
npm run ios:run                 # = build:cap → cap sync ios → cap run ios
# or target a specific device:
npm run ios:run -- --target <device-id>
```

- `npm run ios:sync` (build + sync, no launch) if you prefer to run from Xcode.
- List devices: `npx cap run ios --list`.
- First launch on device: **Settings → General → VPN & Device Management** → trust your dev cert.
- When Live Trail location is wired (Phase 2), iOS will prompt for permission — choose
  **Allow Always** so it emits with the screen locked.

## Phase 1 test checklist

- [ ] `npm run build:cap` succeeds; `dist/index.html` uses `./assets/...` paths.
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
