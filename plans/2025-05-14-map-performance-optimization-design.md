# Design Doc: Map Marker Reconciliation and Stability

**Date:** 2025-05-14
**Author:** Bolt ⚡

## Overview
The current implementation of map markers in TripCast Web (Checkpoints, Missions, Mystery Missions) uses a "destroy-and-recreate" strategy. Whenever the underlying data OR the click handlers change, all existing DOM elements for markers are removed from the map and new ones are created.

## Problem
1. **Unstable Callbacks:** Click handlers passed to `MissionMarkers` and `MysteryMissionMarkers` are currently unstable (recreated on every `TripMap` render). This causes the entire marker set to be destroyed and recreated on every GPS update, panel toggle, or state change.
2. **O(N) DOM Operations:** As the trip scales (the user goal is 1000 items), performing 1000 DOM removals and 1000 DOM insertions on every update will lead to significant main-thread blocking and visual lag.

## Proposed Changes

### 1. Stability Fix
- Wrap click handlers in `useCallback` in `TripMap.tsx`.
- Use the `onClickRef` pattern (already partially present in `CheckpointMarkers`) in all marker components to ensure the `useEffect` doesn't depend on the handler identity.

### 2. Reconciliation Strategy
- Maintain a `Map<string, Marker>` in a `useRef` to track markers by their ID.
- On each update:
    - **Remove:** Identify markers in the Ref that are no longer in the new data and call `.remove()`.
    - **Update:** For markers that still exist, update their position if changed (`setLngLat`) and update their visual state (color, popup content) if needed.
    - **Add:** Create new `maplibregl.Marker` instances only for IDs not currently in the Ref.

## UX Flow
The user will experience smoother map interactions, especially during movement (GPS updates) and when the journal/missions lists grow. There is no change to the UI appearance.

## Success Criteria
- [ ] `npm run validate` passes.
- [ ] Markers correctly appear, disappear, and respond to clicks.
- [ ] Map panning and zooming feel smoother during data updates.
- [ ] Reduced DOM churn confirmed via logging (e.g., `console.count` in the "Add" path).

## Implementation Plan
1. Update `CheckpointMarkers` in `src/features/map/TripMap.tsx` to use reconciliation.
2. Update `MissionMarkers` in `src/features/map/MissionMarkers.tsx` to use reconciliation and stabilize the click handler.
3. Update `MysteryMissionMarkers` in `src/features/map/MysteryMissionMarkers.tsx` to use reconciliation and stabilize the click handler.
4. Verify stability of all callbacks in `TripMap.tsx` passed to these components.
