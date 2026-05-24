# Frontend Implementation Gotchas

Read only when touching the related area.

## Convex API

- Consume backend functions only through `src/convex/tripcastApi.ts`.
- Backend API changes must be made in `tripcast-backend`, exported with `npm run export:web-api`, then copied into the web repo.
- Mutations and queries that require auth pass explicit `token` args.
- A `null` route vote detail means the vote was deleted; show the deleted-vote recovery state, not loading.

## React And Tests

- Keep every hook call reachable on every render, before any early return.
- For `framer-motion` test mocks, use an explicit `motion: { div: ... }` object, not a Proxy.
- Mock `convex/react` hooks in component tests.
- Keep lazy `TripMap` declared at module scope in `App.tsx`.

## Map And Sheets

- Use `src/components/ui/sheet.tsx` for sheets, dialogs, drawers, and panels.
- Map-adjacent panels use bottom `SheetContent` with `modal={false}` and `showBackdrop={false}`.
- Preserve the map section's `overflow-hidden`; removing it causes mobile horizontal scroll.
- The Dock is the only mobile nav surface. Do not reintroduce vertical FAB clusters.
- Only one map-adjacent bottom sheet should be open at a time.
- Non-modal map sheets slide under the Dock; fix covered footer actions with internal padding, not a higher z-index.

## Coordinate Pick

When a form lets users tap the map for coordinates, keep the form mounted and hide it while picking. If the form is inside a `Sheet`, apply `invisible pointer-events-none` directly to `SheetContent`, not to an ancestor.

## Travel Funds

- Traveler manages Travel Funds; Followers see the meter and public per-target totals only.
- Exchange rate field means "Local currency per 1 USD": `usdAmount = localAmount / localCurrencyPerUsd`.
- Per-transaction rate and USD amount are frozen at write time.
- Inline transaction sections auto-open only when `prefill.localAmount` is defined. Do not auto-open on title-only prefill; it blocks mission completion with an unintended amount-required error.

## Journal And Activity

- Journal events are fetched in `TripMap.tsx`, not inside `JournalSheet`.
- Checkpoints may be locationless. Filter with `cp.lat !== undefined && cp.lon !== undefined` before rendering markers.
- At most one current activity can be active; UI should assume backend enforces this.
