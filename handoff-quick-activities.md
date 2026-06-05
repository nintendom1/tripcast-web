# Handoff: Quick Activity Settings Backend Implementation

This document outlines the requirements for implementing the backend (Convex) functions for Quick Activity customization.

## Overview
Quick Activities are the predefined buttons (emoji + label) shown to the traveler in the `TravelerStateSheet` to quickly set their current activity. The traveler can now customize these activities (up to 10) and decide how many to display (display count).

## Data Schema (Convex)

### `QuickActivity` (Object)
- `label`: `string`
- `emoji`: `string`

### `QuickActivitySettings` (Object)
- `activities`: `Array<QuickActivity>`
- `displayCount`: `number` (1 to 10)
- `updatedAt`: `number` (timestamp)

## API Functions to Implement in `convex/currentActivity.ts` (or equivalent)

### `travelerGetQuickActivitySettings` (Query)
- **Args**: `{ token: string }`
- **Behavior**:
  - Validate the traveler token.
  - Fetch the `QuickActivitySettings` for the traveler.
  - **Fallback**: If no settings exist yet, return the following defaults:
    - `displayCount`: 8
    - `activities`:
      ```json
      [
        { "label": "Walking", "emoji": "🚶" },
        { "label": "Eating", "emoji": "🍽️" },
        { "label": "Taking train", "emoji": "🚆" },
        { "label": "Resting", "emoji": "🪑" },
        { "label": "Exploring", "emoji": "🧭" },
        { "label": "Shopping", "emoji": "🛒" },
        { "label": "Errands", "emoji": "💻" },
        { "label": "Sleeping", "emoji": "️🛏️" }
      ]
      ```
- **Returns**: `QuickActivitySettings`

### `travelerUpdateQuickActivitySettings` (Mutation)
- **Args**: `{ token: string, activities: QuickActivity[], displayCount: number }`
- **Behavior**:
  - Validate the traveler token.
  - Validate that `activities` has at most 10 items.
  - Validate that `displayCount` is between 1 and 10.
  - Upsert the `QuickActivitySettings` for the traveler, setting `updatedAt` to the current server time.
- **Returns**: `null`

## Implementation Notes
- The frontend uses a "Push/Pull" model. The frontend maintains its own local state (often in `localStorage` for immediate responsiveness) and only syncs with these backend functions when the user explicitly clicks "Push" or "Pull".
- Ensure that the traveler's session is correctly identified from the `token`.
