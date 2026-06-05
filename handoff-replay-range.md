# Backend Handoff: Replay Range Filtering

## Summary
The Replay feature now supports a dual-thumb range filter on the frontend. This allows users to clip the trip path and replay playhead to a specific window of time (indices of breadcrumbs/checkpoints), which solves the feedback that the total trip view was getting "messy" with zig-zagging lines.

Currently, this filtering is performed entirely on the **frontend**. The client fetches all allowed `liveTrailSamples` and `journalEvents` and then slices them based on the user's selected range.

## Future Optimization: Backend Filtering
If trips grow very long (thousands of breadcrumbs), fetching the entire trail just to replay a small window becomes inefficient. A future LLM or developer should consider moving the range filter to the backend.

### Proposed Changes
1. **Convex Query Update**:
   - Modify `listReplayLiveTrailSamples` (and potentially `listJournalEvents`) in the backend to accept `startTime` and `endTime` parameters.
   - The query should use an index on `sampledAt` or `occurredAt` to efficiently fetch only the requested range.

2. **Frontend Update**:
   - Instead of fetching everything in `loadReplayTrailSamples`, the frontend could initially fetch a "summary" or just the first/last timestamps to populate the range slider.
   - As the user adjusts the range slider, the client could debounced-fetch the actual detailed samples for that specific window.

3. **Considerations**:
   - The "Follower Cutoff" is already implemented in the backend (passed via `cutoffAt` to `listReplayLiveTrailSamples`). Any new range filter must be an *additional* constraint on top of this security/privacy cutoff.
   - The `buildReplayPins` logic currently expects a contiguous set of points to build a smooth timeline. Backend pagination or range fetching needs to ensure no gaps are introduced that would break the line-drawing logic in `useTripPath`.

## Current Implementation State
- **UI**: `TripReplayHud` contains a `RangeSlider` (dual-thumb).
- **State**: `TripMap.tsx` manages `replayRange` as `[startIndex, endIndex]`.
- **Logic**: `filteredCheckpoints` and `filteredTrailSamples` are computed on the fly and passed to `useTripPath`.
