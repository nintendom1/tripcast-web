# Background Pin Uploads

## Objective
Enable a "fire and forget" experience for saving pins. When a traveler taps "Save Pin", the sheet closes immediately, and the app handles the image upload and Convex mutation in the background with visible progress and persistence.

## Architecture

### 1. BackgroundSaveProvider
- **Location**: `src/providers/BackgroundSaveProvider.tsx`
- **Responsibility**: Manages the upload queue state and lifecycle.
- **States**: `uploading` -> `saving` -> `complete` (success) OR `failed`.
- **Persistence**: Uses IndexedDB to store the `PendingSave` object (including image `Blob` and form metadata). This ensures uploads can be resumed or retried if the app is closed/killed.

### 2. HUD Integration
- **BackgroundUploadBar**: A slim progress bar sitting above the Dock in `TripMap`. Shows active upload progress.
- **BackgroundSaveRetryToast**: A persistent error notification that appears if an upload fails. It allows the user to re-open the `AddCheckpointSheet` with their data intact.

### 3. iOS Integration (Live Activities)
- A Capacitor bridge (`LiveActivityPlugin.swift`) is provided to start and update Live Activities for the Dynamic Island.
- Requires a manual Xcode target setup (see `docs/ios-live-activities-setup.md`).

## Strategy for Maintenance
- **Image Persistence**: We store the raw `Blob` in IndexedDB. Be careful with storage limits, though modern browsers handle several hundred MBs easily.
- **Concurrency**: The provider currently supports multiple concurrent uploads, but the HUD only focuses on the most recent one.
- **Auth**: The provider uses the `token` passed on mount. If the token changes (sign-out), pending uploads will fire with the stale token (a known limitation — see the auth gotcha file).

## Local Latency / Chaos Simulation

`BackgroundSaveProvider` reads three Vite env vars to make the upload UX
exercisable on a fast localhost. All default to 0 (no-op) — they only affect
the dev server. Set in `.env.local`:

```
VITE_BG_SAVE_SLOW_MS=2500       # split half before upload, half before checkpoint mutation
VITE_BG_SAVE_FAIL_RATE=0.5      # 0..1; probability the upload OR checkpoint throws
VITE_BG_SAVE_LINK_FAIL_RATE=0.3 # 0..1; probability the spend-tracking link step fails
```

Behavior:
- **`SLOW_MS`** delays the upload and checkpoint steps so the bar's progress
  states (10% → 50% → 70% → 80%) become visible at human timescales.
- **`FAIL_RATE`** simulates a transport / mutation failure, triggering the
  retry toast with live backoff countdown (`2^n × 2s`, capped at 30s).
- **`LINK_FAIL_RATE`** simulates the partial-success case — checkpoint
  created, transaction link failed — surfacing the distinct
  "Spend Tracking Failed" toast and the relink-only retry path. Only fires
  when the save actually has staged transactions to link.

A `console.info` line is printed on app start when any sim var is non-zero,
so you can tell sim mode is active without re-reading `.env.local`.

Recovery tip: failed saves persist in IndexedDB across reloads. If chaos
mode left the queue cluttered, clear it from DevTools console:
```js
indexedDB.deleteDatabase("tripcast_bg_saves")
```
