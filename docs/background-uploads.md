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
- **Auth**: The provider uses the `token` passed on mount. If the token changes (sign-out), pending uploads will fail or should be cleared.
