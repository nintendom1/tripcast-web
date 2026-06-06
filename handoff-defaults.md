# Backend Handoff: Changing Application Defaults

To align with current usage patterns and streamline the debugging flow, we are changing the default settings for Live Trail and Trip Path visibility from "Disabled" to "Enabled". While the frontend has been updated with these fallbacks, the backend should be updated to ensure consistency for new travelers.

## Required Changes in `tripcast-backend`

### 1. Live Trail Status Defaults
In the logic that initializes or returns `LiveTrailStatus` (likely in a query like `liveTrail:travelerGetLiveTrailStatus` or similar), the default values for `enabled` and `visibleToFollowers` should be changed to `true`.

- **Field:** `enabled`
  - **From:** `false`
  - **To:** `true`
- **Field:** `visibleToFollowers`
  - **From:** `false`
  - **To:** `true`

### 2. Traveler Preferences Defaults
In the logic that initializes or returns `TravelerPreferences` (likely in `travelerPreferences:travelerGetPreferences` and `travelerPreferences:followerGetPreferences`), the default for `allowFollowersTripPath` should be `true`.

- **Field:** `allowFollowersTripPath`
  - **From:** `false`
  - **To:** `true`

## Impact
These changes will ensure that any new traveler who joins the app will have Live Trail recording and follower visibility for both the trail and the trip path turned on by default, matching the updated frontend fallbacks.
