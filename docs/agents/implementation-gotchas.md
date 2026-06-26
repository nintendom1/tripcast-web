# Frontend Implementation Gotchas

Read only when touching the related area.

## Convex API

- Consume backend functions only through `src/convex/tripcastApi.ts`.
- Backend API changes must be made in `tripcast-backend`, exported with `npm run export:web-api`, then copied into the web repo.
- Mutations and queries that require auth pass explicit `token` args.
- A `null` route vote detail means the vote was deleted; show the deleted-vote recovery state, not loading.

## React And Tests

- Keep every hook call reachable on every render, before any early return.
- A thrown `useQuery` error is caught only by an **ancestor** error boundary, never the component that calls the hook. To contain a sheet, put its queries in a child wrapped by `FeatureBoundary` (the `BulkExportSheet` / `BulkExportBody` split).
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

## Replay And Live Trail

- Normal map load should keep using the bounded recent Live Trail queries. Whole-trip breadcrumbs are loaded by replay as a one-shot paged Convex query, not as a full-history reactive subscription.
- Traveler replay should not pass the Follower cutoff to the replay Live Trail query. The Traveler's normal map can still use the cutoff preview state, but replay is the escape hatch for seeing the whole trip.
- Follower replay relies on backend cutoff enforcement for Live Trail samples. Frontend debug logs may show `cutoffApplied: null` for Followers because the server applies the effective cutoff internally.
- Delete Trail mini-map state is driven by selected sample IDs. Retained breadcrumbs should remain grey, while selected/deleting points use the destructive trail color; keep the GeoJSON `selected` property in sync when ranges, modes, or checkboxes change.

## Map Camera (MapLibre GL)

- **Padding is sticky across calls.** Whenever `focusCoordinate` / `applyActiveFocus` (`src/features/map/focusCoordinate.ts`) runs, it sets camera padding so the target lands in the visible band above a sheet. That padding state **persists**. A subsequent plain `easeTo({center: X})` will put X at the *band* center, not the geometric center. Pass an explicit `padding: {top:0, right:0, bottom:0, left:0}` whenever you want geometric semantics (e.g. the crosshair-at-center invariant of the picker).
- **Animated `easeTo` races with container resize.** If the same React commit toggles a class that changes the map container size — collapsing the TopBar wrapper to `h-0`, switching `mapAdjacent` sheet sizes — use `jumpTo` for that move. `easeTo` animations started before the resize finish at unpredictable centers.
- **`requestAnimationFrame` defers across the commit.** When you must run a camera op *after* a state change has flushed (e.g. recenter after the originating sheet returns from `invisible`), schedule it with a single `requestAnimationFrame`. Synchronous calls measure the pre-commit DOM.

### DOM markers (`maplibregl.Marker`)

- **SVG `fill="var(--flag)"` attribute is unreliable.** Some browsers don't resolve `var()` in SVG presentation attributes. Use inline `style="fill: var(--flag)"` instead. Same for `stroke`.
- **Don't make the marker wrapper `<div>` size-0.** `width:0;height:0` collapses the inner SVG. Use `pointer-events:none;line-height:0` if you need to control spacing without affecting visibility.

## Coordinate Pick

The crosshair picker (`src/features/map/TripMap.tsx`) lets a form capture a coordinate by moving the map under a fixed reticle. Keep these rules in mind when adding new picker entry points or touching the existing flow.

### Hide more than the originating sheet
- Apply `invisible pointer-events-none` directly to the originating `SheetContent` (not to an ancestor). Keep the form mounted so state survives the pick.
- The TopBar and TripTicker also occlude the helper banner. Route a single `onPickerActiveChange(active)` callback from `TripMap` up to `App`, and wrap the chrome in `invisible h-0 overflow-hidden` while picking.
- Hide the StatusCard / HUD anchor (e.g. `cardsWrapperRef` in `TripMap`) the same way.

### Pre-fill the entry coord on "Change"/edit flows
- Thread an optional `initialCoord` through the picker request signature.
- On picker entry, `jumpTo` the initial coord (see "Map Camera" — use `jumpTo`, not `easeTo`, because the chrome collapse resizes the container in the same commit). Otherwise the crosshair starts wherever the user was panning, not on the original pin.

### Live-track the map center efficiently
- The `move` event fires at frame rate during a drag. rAF-coalesce the `setPickCenter` call (one update per animation frame) — otherwise the whole `TripMap` subtree re-renders on every frame and the map drags choppily.

### Dock taps cancel pick mode
- The Dock navigates away; lingering picker state confuses the user. Cancel the picker in `handleDockSelect` / `handleDockAdd` / `handleFanPick` before doing anything else.

### Preview pin lifecycle
- After Confirm, render a temporary DOM marker at the picked coord so the user sees where their selection landed while filling out the rest of the form. The real mission/story marker doesn't exist yet.
- Clear the preview on three triggers: re-entry to pick mode (Change), successful form Save (`onCoordinatePickSaved` callback), and originating sheet close. Without the Save hook the preview lingers behind the real marker until the user closes the sheet.

### Tap-to-recenter must reset padding
- `map.on("click", ...)` during pick mode does `easeTo({center: event.lngLat})` to pan the clicked point under the crosshair. Pass an explicit `padding: {top:0, right:0, bottom:0, left:0}` — see "Map Camera".

## Travel Funds

- Traveler manages Travel Funds; Followers see the meter and public per-target totals only.
- Exchange rate field means "Local currency per 1 USD": `usdAmount = localAmount / localCurrencyPerUsd`.
- Per-transaction rate and USD amount are frozen at write time.
- Inline transaction sections auto-open only when `prefill.localAmount` is defined. Do not auto-open on title-only prefill; it blocks mission completion with an unintended amount-required error.

## Journal And Activity

- Journal events are fetched in `TripMap.tsx`, not inside `JournalSheet`.
- Checkpoints may be locationless. Filter with `cp.lat !== undefined && cp.lon !== undefined` before rendering markers.
- At most one current activity can be active; UI should assume backend enforces this.
