# Replay Fix Review

## Objectives
- **Follow Visited Trail:** Adjust replay to strictly follow completed activities (story pins, completed missions, and live trails).
- **Exclude Non-Visited:** Remove proposed, visible, planned, in-progress, or dropped missions and route votes from the replay sequence.
- **Smoother Traversal:** Improve the "jittery" movement during breadcrumb replay so the focus marker and camera "slide" between points.
- **Point-by-Point Reveal:** Ensure the map path line grows exactly with the replay progress instead of jumping ahead to the next checkpoint.
- **Dwell on All Checkpoints:** Ensure both stories and completed missions dwell for the POI card to be read.
- **Fix Notes:** Ensure POI cards correctly display the note body for all completed event types.

## Files Changed
- `src/features/map/TripMap.tsx`: Core replay logic, pin building, camera movement, and marker rendering.

## Summary of Changes

### 1. Replay Sequence Filtering
- Updated `buildReplayPins` to filter journal events strictly for `story` and `mission_completed` types.
- Increased breadcrumb density by reducing the minimum interval from 60 seconds to 5 seconds (`MIN_REPLAY_BC_INTERVAL_MS`).

### 2. Precise Trail Reveal
- Changed `replayRevealUpTo` to return the timestamp of the *current* pin instead of the *next* checkpoint. This ensures the line follows the focus marker precisely.

### 3. Smooth Movement ("Sliding")
- Reduced `REPLAY_BASE_BEAT_MS` to 200ms (at 1x speed) to provide a higher frequency of updates.
- **Marker Smoothing:** Updated `ReplayFocusMarker` to apply a CSS transition (`transition: transform`) to its element. The duration and easing are passed from the replay loop.
- **Camera Smoothing:** Updated the camera `easeTo` logic in the replay effect:
  - For breadcrumbs: Uses linear easing and matches the animation duration to the current beat interval. This creates a continuous sliding motion.
  - For checkpoints: Maintains the standard ease-out and dwell time to ensure they remain distinct "stops".

### 4. POI Card Note Fix
- Updated the note lookup in the replay overlay to use the journal `eventId` instead of the internal `checkpointId`. This ensures that `mission_completed` events, which might not have a direct checkpoint record in all contexts, can still display their associated text body.

## Gaps & Checks
- **Performance:** High-frequency camera updates (every 200ms) might be heavy on some devices; needs verification during use.
- **Note Display:** Verify that "Completed Mission" notes are correctly populated in the backend data to be picked up by the replay.
- **Linear Easing:** Linear movement is best for a continuous trail, but check if it feels robotic compared to a slight ease at the start/end of the breadcrumb chain.
