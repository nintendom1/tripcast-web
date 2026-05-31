# Backend Handoff: Trip Ticker

The Trip Ticker is currently implemented with frontend-only persistence via `localStorage`. For per-trip persistence and Follower visibility, the following backend changes are recommended.

## Recommended Schema Updates (Convex)

### `tripcastApi.tickerSettings`

New document type/fields in `trips` or a separate `tickerSettings` table:

```ts
export type TickerMessage = {
  id: string;
  text: string;
};

export type TickerSettings = {
  enabled: boolean;            // Global toggle for the trip
  priorityMessages: TickerMessage[];
  funFacts: TickerMessage[];
  funFactsEnabled: boolean;     // Toggle for fun facts
  funFactIntervalMinutes: number;
  // Follower visibility settings
  showPriorityToFollowers: boolean;
  showFunFactsToFollowers: boolean;
};
```

## Recommended API Functions

- `travelerGetTickerSettings({ token })`: Fetch current settings.
- `travelerUpdateTickerSettings({ token, ...patch })`: Update global toggles and interval.
- `travelerAddTickerMessage({ token, type: "priority" | "fact", text })`: Add a message.
- `travelerRemoveTickerMessage({ token, messageId })`: Remove a message.
- `followerGetTicker({ token })`: Returns the current message to display for a follower based on the traveler's settings and rotation logic (or allows the frontend to calculate it if settings are synced).

## Implementation Notes

- **Rotation Logic**: The current frontend implementation in `useTicker.ts` handles rotation. If synced to the backend, `lastFunFactAt` should remain local to the session to avoid desyncing multiple viewers, OR be managed globally if absolute synchronization is desired.
- **Follower Experience**: Tickers are a great way to communicate status ("Bad signal in the valley") to followers without cluttering the Journal.

---
*Note: This file is intended for backend handoff and should be deleted once the backend implementation is complete.*
