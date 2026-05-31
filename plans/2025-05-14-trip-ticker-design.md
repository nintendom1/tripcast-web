# Design Doc: Trip Ticker

**Topic:** Trip Ticker / Scrolling Banner
**Status:** Draft
**Date:** 2025-05-14

## 1. Overview
Implement a reusable **Trip Ticker** banner for TripCast: a persistent scrolling text banner for important trip notices or fun facts. It should feel playful/game-like, work over the map, and coexist with the HUD.

## 2. Goals & Success Criteria
- [ ] Persistent, low-height scrolling banner below the `TopBar`.
- [ ] Priority messages take precedence and loop continuously.
- [ ] Fun facts appear at intervals, scroll once, then hide.
- [ ] Support for emojis and text.
- [ ] Hover/touch to pause scrolling.
- [ ] Respects `prefers-reduced-motion`.
- [ ] Traveler-facing management UI in `OptionsSheet`.
- [ ] Frontend persistence via `localStorage` (with backend handoff doc).
- [ ] Storybook coverage and unit tests.
- [ ] Debug logging for ticker events.

## 3. UX Flow
- **Visibility**: The ticker sits at the top of the map area, just below the `TopBar`.
- **Priority Loop**: If priority messages exist, they scroll one after another.
- **Fun Fact Interval**: If no priority messages, a fun fact scrolls once every X minutes (default 10), then the ticker hides.
- **Management**: Traveler goes to Options -> Trip Ticker to:
  - Toggle ticker/fun facts.
  - Manage (Add/Edit/Remove) message lists.
  - Change fun fact frequency.
  - Clear all messages.

## 4. Technical Implementation

### Components
- `TripTicker.tsx`: Functional component using `framer-motion` for the marquee effect.
- `TickerManager.ts`: Hook/Logic to handle rotation, timing, and `localStorage` syncing.
- `TickerSettings.tsx`: Sub-view or section in `OptionsSheet`.

### Animation
- Marquee effect using `motion.div`.
- Pause on hover/tap.
- Fallback for `prefers-reduced-motion`.

### Persistence
- Use `localStorage` key `tripcast.ticker_settings`.
- Schema:
  ```ts
  {
    enabled: boolean,
    priorityMessages: string[],
    funFacts: string[],
    funFactsEnabled: boolean,
    funFactIntervalMinutes: number,
    lastFunFactAt: number
  }
  ```

## 5. Accessibility
- Use `aria-live="polite"` or similar where appropriate, but ensure it doesn't become annoying.
- High contrast colors for both Meadow and Constellation themes.
- Manual toggle for motion if `prefers-reduced-motion` is detected.

## 6. Debugging
- Log events to `debugLogger`:
  - `ticker:show`, `ticker:hide`
  - `ticker:message_rotated`
  - `ticker:settings_updated`
  - `ticker:reduced_motion_active`
