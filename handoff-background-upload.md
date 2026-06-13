# Handoff: Background Pin Upload Feature

## Context
The user wanted to avoid the UI freeze during pin saves. I have implemented a background save system that closes the sheet immediately and handles the upload/save process in the background.

## What I Did
1.  **Persistence Layer**: Created `src/lib/idb.ts` using IndexedDB to store pending saves (metadata + image Blobs).
2.  **Core Logic**: Created `src/providers/BackgroundSaveProvider.tsx`. It captures form data and handles the image upload -> Convex mutation flow. It now handles:
    -   **Transaction Linking**: Staged transactions are captured and linked after the pin is created.
    -   **Badge Awards**: Mission completion badges are awarded correctly.
    -   **Post-Save Navigation**: The `onCheckpointCreated` callback is preserved and called after the background save completes.
3.  **UI Components**:
    - `BackgroundUploadBar.tsx`: Progress feedback in the HUD above the Dock.
    - `BackgroundSaveRetryToast.tsx`: Error recovery UI with a "Retry" button that restores the sheet.
4.  **Refactoring**: Simplified `AddCheckpointSheet.tsx` and `TripMap.tsx` to hand off saves to the provider.
5.  **iOS Bridge**: Added Swift files for a Capacitor-based Dynamic Island implementation and integrated the TS calls in the provider.

## Intentions
-   **User Feedback**: Tapping save feels instant. The sheet clinks and closes.
-   **Reliability**: If the internet cuts out, the data isn't lost (it's in IndexedDB).
-   **Recovery**: The "Retry" button in the toast re-opens the sheet with the image and text restored.
-   **Native Integration**: Live Activity support is wired up for the Dynamic Island (requires manual Xcode target setup).

## Gaps & Future Work
-   **Progress Granularity**: `uploadStoryImage` is currently an `await` block. For smoother progress bars, it should be refactored to use `XMLHttpRequest` or `fetch` with a `ReadableStream` to report byte-level progress. Currently, we jump from 10% to 50% to 80%.
-   **Multiple Failures**: The HUD toast only shows the most recent failure if multiple pins fail simultaneously.

## How to Test
1.  Add a pin with a photo.
2.  The sheet should close immediately.
3.  Watch the progress bar above the Dock.
4.  (Optional) Simulate a failure (e.g., go offline) and verify the Retry toast appears.
5.  Click Retry and ensure the sheet re-opens with your data.
