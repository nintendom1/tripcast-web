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
- When a child component renders into `document.body` via `createPortal` while a `Sheet` is open, mark the portal target with a data attribute and add the selector to `sheet.tsx`'s outside-press allowlist (existing entries: `[data-debug-chip]`, `[data-reaction-tray]`). Otherwise the Sheet's Base UI `Dialog` treats clicks on the portaled element as `outside-press` and closes itself.

## Intro Sequence Theming

The `IntroSequence` manages its own visual dark/light state independently of the global ThemeProvider.

- **Two token families, never mixed.** Beats 0–4 hardcode Meadow brand tokens (`--meadow-*`) and are immune to ThemeProvider state — do not replace these with functional tokens. The theme beat (beat 5) switches to functional tokens (`--bg-paper`, `--ink-1`, `--card`) only when `isDarkPreview` is true.
- **`isDarkPreview`, not `resolvedTheme`, drives visual state.** `resolvedTheme` from `useTheme()` is only consulted inside the `isDarkPreview` calculation (for the auto+night case). Nothing else in the intro should read from `resolvedTheme` directly to decide colors.
- **`setMode` must be called when the user picks a theme.** The functional tokens get their dark values from `applyThemeVariables("constellation")`, which runs inside ThemeProvider when `setMode("constellation")` is called. Without it, functional tokens still carry Meadow values and the dark preview renders incorrectly.
- **Adding `.dark` to the intro container div does not change CSS variable values.** TripCast variables are set as inline styles on `:root` by JavaScript, not via a `.dark { }` CSS rule. The class is a conventional marker only.

## Map Layers And Theming (MapLibre GL)

- Theme changes call `map.setStyle()`, which **wipes all custom sources/layers** — every custom layer (lines, breadcrumbs, GeoJSON overlays) must re-add itself after a swap or it's gone until refresh.
- Re-add on `style.load` (fires after every `setStyle`; earliest point `addSource`/`addLayer` are safe). Don't gate on `map.isStyleLoaded()` — it stays `false` until tiles load (≈ the `idle` event, ~0.7s later), yet adds only need the parsed style spec. Don't rely on `map.once("load")` either: it fires once per map lifetime, never after `setStyle`.
- Canonical pattern (`src/features/map/useTripPath.ts`): add on `style.load`/`load` ungated; keep `styledata`/`idle` as `isStyleLoaded()`-gated backstops; guard each add with `!map.getSource(id)` to stay idempotent and quiet during pan/zoom.
- GL paint properties **can't use CSS variables** — read `useTheme()` and pass hex values. DOM markers (`maplibregl.Marker`, `pinStyles.ts`) survive `setStyle` and *can* use CSS vars, so they theme by a different mechanism than GL layers.

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
