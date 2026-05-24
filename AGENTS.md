# TripCast Web: Canonical Contract

## The Four Principles in Detail

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

LLMs often pick an interpretation silently and run with it. This principle forces explicit reasoning:

- **State assumptions explicitly** — If uncertain, ask rather than guess
- **Present multiple interpretations** — Don't pick silently when ambiguity exists
- **Push back when warranted** — If a simpler approach exists, say so
- **Stop when confused** — Name what's unclear and ask for clarification

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

Combat the tendency toward overengineering:

- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it

**The test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it — don't delete it

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked

**The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform imperative tasks into verifiable goals:

| Instead of... | Transform to... |
|--------------|-----------------|
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug" | "Write a test that reproduces it, then make it pass" |
| "Refactor X" | "Ensure tests pass before and after" |

For multi-step tasks, state a brief plan (Use the todo tool if available):

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let the LLM loop independently. Weak criteria ("make it work") require constant clarification.

---

## Project Overview
TripCast Web is the React/Vite frontend using MapLibre GL JS and Base UI.
- **Roles**: Traveler (Admin) and Follower (View/Vote).

## Setup & Validation
- **Install**: `npm install` in `tripcast-web/`.
- **Validation**: `npm run validate` (typecheck → lint → tests).
- **Testing**: `npm run test` (Vitest with `jsdom`).

## Read-on-demand agent procedures
Do not read these files by default. Read them only when relevant.

- `docs/agents/commit-and-pr.md`: read when committing or writing PRs.
- `docs/agents/quiet-mode.md`: read when asked for Quiet Mode.
- `docs/agents/run-continuously.md`: read when running autonomously.
- `docs/agents/validation.md`: read before claiming completion.
- `docs/agents/debug-log.md`: read when changing debug UI or logging.
- `docs/agents/terminology.md`: read for terminology/UI copy changes.
- `docs/agents/visual-testing.md`: read for visual tests (Playwright).

## Engineering Standards
- Use TypeScript strictly.
- Use `react-error-boundary` for component containment.
- **Security**: Never commit secrets. Use `Gitleaks` local scanning.

## Feature Branch Policy

- **Never work directly on `main`.** Always create a feature branch before making changes.
- Name feature branches with hyphens only — no slashes. Examples: `feat-mission-lifecycle`, `fix-map-markers`, `chore-update-deps`.
- If you find yourself on `main` at the start of a task, create a feature branch first via `git checkout -b <branch-name>`.
- When creating a frontend git worktree, copy the existing `.env.local` from the primary frontend checkout into the new worktree before running Vite. Keep `.env.local` untracked and never commit it.

## Frontend Worktree Setup

When creating a frontend git worktree:

1. Copy `.env.local` from the primary frontend checkout into the new worktree.
2. Check whether `node_modules/.bin/tsc` exists in the new worktree.
3. If it is missing, run `npm install` in the new worktree before validation.
4. Do not treat `tsc is not recognized` as a TypeScript failure; it means dependencies are not installed in that worktree.
5. After installing dependencies, rerun `npm run validate`.

Do not symlink or reuse `node_modules` across worktrees by default, especially on Windows.

## Planning Mode Behavior

- When in planning mode, **ask clarifying questions as needed to explore and refine requirements** before finalizing the plan. Probe for edge cases, prioritization, and constraints the user may not have stated.

- This repo is public.
- Avoid exposing private roadmap, product strategy, or sensitive implementation details, even in commit messages.
- Keep UI barebones for this phase.
- Use Vite, React, and TypeScript.
- Use MapLibre GL JS and do not add paid or token-based map providers.
- Do not commit secrets, `.env`, or `.env.local`.
- Treat secret scanning as part of the normal workflow before commits and PRs.
- Consume Convex through `src/convex/tripcastApi.ts`. Do not hand-write function references — regenerate this file via `npm run export:web-api` in `tripcast-backend` then copy the output.
- All mutations take an explicit `token` arg for auth. Do not use `clientId`; that field was removed.
- When the backend returns `null` for a route vote detail query, the frontend shows a deleted-vote recovery state ("This route vote was deleted.") with a "Back to votes" button — do not treat this as a loading state.
- Use `react-error-boundary` for React render, lazy import, and Convex `useQuery` thrown-error containment; it does not replace delayed pending/offline UI or local `try/catch` for async mutations and event handlers.
- Keep lazy `TripMap` declared at module scope in `App.tsx`; creating `React.lazy()` inside a component can loop on the Suspense fallback and leave the app stuck at "Loading map...".
- Emergency Reset sheet (`src/features/privacy/EmergencyResetSheet.tsx`) is gated to the `"traveler"` role. It uses one grouped backend reset mutation with a confirmation tap; rate-limit errors from the backend are shown in a `role="alert"` paragraph.
- Avoid unnecessary map remounts, style resets, or tile request loops.
- Backend API changes belong in `tripcast-backend`.
- If stuck after two failed attempts, stop, summarize what failed, and propose a better next attempt.

## Linting (Rules of Hooks)

Run lint:

```bash
npm run lint        # check
npm run lint:fix    # auto-fix what it can (mostly unused-disable cleanup)
```

The lint config (`eslint.config.js`) is intentionally narrow — only `react-hooks/rules-of-hooks` (error) and `react-hooks/exhaustive-deps` (warn) are enforced. The rest of static analysis stays with `tsc -b` + tests + code review.

### Rules of Hooks — non-negotiable

**Every hook call must be reachable on every render of a component.** In practice that means:

- Put all `useState` / `useEffect` / `useQuery` / `useMutation` / `useMemo` / `useRef` / `useContext` (and project-specific custom hooks like `useJournalUnread`, `useReadingSpeed`, `useMusic`, `useDelayedPending`, `useOnlineStatus`) at the **top of the function body**, before any `if (…) return …` early-return branches.
- A new hook added below an early return changes the hook count between renders that fire the early return vs. renders that fall through. React throws `"Rendered more hooks than during the previous render"` — the root `ErrorBoundary` in `App.tsx` catches it and the user sees the fullscreen error fallback instead of the app. This bug class shipped once during the UX rework (commit `704fcb8` → fix `39468ef`) and is exactly what the lint rule now blocks.
- When the hook's body needs a value that's only well-defined after the early returns (e.g. `activeSessionCheck.role`), derive a nullable form at the top (`const currentRole = activeSessionCheck?.role ?? null`) and put the conditional logic **inside** the effect body, not around the effect call site.
- For genuinely missing-but-stable deps in `exhaustive-deps`, add a one-line `// eslint-disable-next-line react-hooks/exhaustive-deps` with a comment above explaining why the dep is closure-stable (ref-driven, stable React setter, or stable Convex mutation handle). Don't disable the rule without the rationale.

CI runs `npm run lint` before tests. Run `npm run validate` before pushing — it covers lint, types, and tests in one command.

## Testing

Run tests:

```bash
npm run test
```

Test runner: `vitest` with `jsdom` environment. React components use `@testing-library/react` and `@testing-library/user-event`. `convex/react` (`useMutation`, `useQuery`) is always mocked — no Convex deployment needed.

When adding new component tests:
- Mock `convex/react` at the top of the file.
- For components that use `framer-motion`, mock it with an explicit `motion: { div: ... }` object — do NOT use a Proxy (causes JSX type errors).
- When a component calls `useMutation` multiple times in fixed hook order, use a modulo-safe call-counter mock: `mockValues[callCount++ % N]`.

## Patterns & Gotchas

- Use the shared Base UI-backed sheet primitives in `src/components/ui/sheet.tsx` for sheet, dialog, drawer, and panel overlays. Do not introduce ad hoc `motion.div`/absolute-positioned overlays for these flows unless the UI is a transient non-dialog element such as a toast or map placement banner.
- Let Base UI own dialog semantics, focus handling, escape/outside close behavior, and portal structure. Use `framer-motion` only when extra motion is needed on top of an accessible primitive.
- Map-adjacent bottom panels that should not dim or block the map should still use `Sheet`/`SheetContent` with `modal={false}` and `showBackdrop={false}`. Modal flows such as Options and Emergency Reset should keep the default backdrop/modal behavior.
- Journal events are fetched in `TripMap.tsx`, not inside `JournalSheet` — one Convex subscription drives both the sheet and the unread badge. Do not move the query into the sheet.
- `StoryDetailSheet` auto-focuses the map on mount via `useEffect` when `lat`/`lon` are present.
- Checkpoint `lat`/`lon` are optional (`lat?: number`, `lon?: number` in `tripcastApi.ts`). The JournalSheet inline create flow (`source: "inline_form"`) produces locationless checkpoints. Map code that renders checkpoint markers must filter to `cp.lat !== undefined && cp.lon !== undefined` before accessing the values or calling `setLngLat` — assuming all checkpoints have coordinates causes a TS error at the `setLngLat` call site and would silently skip rendering or crash the markers effect.
- Unread journal state is tracked in `localStorage` under the key `tripcast.journalLastReadAt` (`src/features/journal/useJournalUnread.ts`).
- `TravelerStateCard` and `CurrentActivityCard` share a positioning wrapper in `TripMap.tsx` (`absolute top-5 left-5 z-[2] flex flex-col gap-2`). Neither card carries its own absolute positioning. `TravelFundsCard` mounts as the third sibling in the same wrapper.
- Travel Funds management (`src/features/travelfunds/TravelFundsSheet.tsx`) is Traveler-only. Both the Options entry ("Manage Travel Funds") and the map card's "Manage" button render the same `TravelFundsSheet` content. Follower sees the meter card only — no management UI.
- The Add/Edit Transaction form's exchange-rate field uses **"Local currency per 1 USD"** (spec Option B): `usdAmount = localAmount / localCurrencyPerUsd`. For `USD` the rate is forced to `1` server-side. The per-transaction rate and computed USD value are frozen at write time — later rate edits do not affect existing transactions.
- `src/features/travelfunds/TravelFundsInlineSection.tsx` is the collapsable cost-entry section embedded in completion forms (the check-in form via `TripMap`'s `AddCheckpointSheet` next to "Also Update Traveler State", and `MissionDetailSheet`'s in-progress complete action). It serializes to a `TransactionInlineInput | null` via its `onChange` prop. The parent passes the value as the optional `transaction` arg on `addCheckpoint` / `travelerCompleteMission` / `travelerCompleteMissionAsStory` so the transaction lands atomically with the parent record. Server fills `linkedCheckpointId` / `linkedMissionId` / `linkedActivityId` — the client never sends them in the inline path. For missions with `estimatedCostUsd`, the section pre-fills `currencyCode = "USD"`, `localCurrencyPerUsd = 1`, `localAmount = estimatedCostUsd` to make confirming the budgeted amount a one-tap action. **Auto-open rule (known failure mode):** the section auto-opens only when `prefill.localAmount` is defined — a title-only prefill leaves it collapsed. A previous version opened on `prefill.title` too; because all missions have titles, this caused the validation error "Transaction amount is required" to surface immediately on every mission completion attempt, silently blocking both "Complete as story" and "Mark complete (no story)" even when the user never intended to log a cost. Do not reintroduce auto-open on title.
- `JournalSheet` requires a `token` prop. It subscribes to `tripcastApi.travelFunds.getLinkedCostMap` and threads per-event `actualCostUsd` into each `StoryRailItem` (matched by `event.missionId` for `mission_completed`, by `event.checkpointId` for `check_in`). Followers see the public-only aggregate (server enforces); private/summary_only rows still affect the global meter but never the per-card "Actual cost".
- Bulk Import is Traveler-only from Options -> Data / Dev (`src/features/options/BulkImportSheet.tsx`). It uses `tripcastApi.bulkImport.previewBulkImport` for backend-owned validation and `tripcastApi.bulkImport.travelerBulkImport` for commit; keep the paste -> preview -> commit flow so invalid rows never write partial data. The backend accepts either a raw entries array or `{ timeZone, entries }`, up to 50 entries, timestamp numbers/strings, and `ref` links between Stories/check-ins, transactions, route votes/options, and missions. Date-only timestamps use midnight in the selected IANA timezone. Image-block story import is not implemented in the backend yet.
- Traveler State Auto mode (`src/features/travelstate/AutoStateTab.tsx`, `autoStateCalc.ts`) replaces the legacy frontend-only 10pt/hr stomach decay (now removed). When Auto is OFF, Energy and Stomach show last-saved values with no implicit drift. When ON, the persisted `travelerAutoState` row + the pure integer-tick calc helper estimate Energy/Stomach locally; nothing is auto-written to Convex on a timer. Opening `TravelerStateSheet` preloads Energy/Stomach from the current auto estimate so manual edits start from the values shown in the HUD. The calc helper takes the Traveler's stored IANA timezone — Followers compute the same phases regardless of their browser tz. Saving manual State while Auto is on re-anchors the Auto base atomically server-side from the edited/current values.
- The terminology linter (`scripts/lintTerms.mjs` + `terminology.config.json`) is deliberately scoped to **shipping copy** to avoid churn. It does **not** scan tests (`*.test.*`/`*.spec.*`), tooling (`*.mjs`, the `scripts/` dir), or generated code. The rule set only flags display-form terms (Title-Case `History`/`Challenge`/`Check-in`/`Crew`, two-word `map marker`, `Debug Mode`, etc.); the old broad single-word rules (`\bhistory\b`, `\bchallenge\b`, `\bmarker\b`, `\bcheck-in\b`) were removed because they fired on ordinary English in comments, identifiers, and prose. The backend config additionally keeps precise `code-*` identifier-migration rules (`supportCrew`, `historyEvents`, `check_in`, …) — those are surgical, keep them. Web and backend each have their own `terminology.config.json` + `terminology-baseline.json`; if you add a rule, mirror it and regenerate baselines via `npm run lint:terms:baseline`.
- The linter is **advisory**: `npm run validate` runs it via `lint:terms:report` (prints findings, exit 0). `npm run lint:terms` (enforce) still fails on new violations vs. the baseline and stays available for an explicit gate. As a last-resort per-line escape, `// term-lint-disable-line [ruleId...]` (same line) or `// term-lint-disable-next-line [ruleId...]` (line above) suppresses a match — space/comma-separated rule ids scope it; no ids suppress all. A standalone `term-lint-disable-next-line` comment line is itself exempt from scanning. The two `scripts/lintTerms.mjs` copies (web + backend) are identical — keep them in sync.
- Music uses the Web Audio-only engine in `src/lib/audio/engine.ts`; do not add bundled audio files or token-based providers. Components should call `useMusicSafe().sfx(...)` for local interaction sounds. Use `open` / `close` for sheet visibility, `page` for internal panel navigation, `pin` for map placement or saved pins, `vote` after a successful Follower vote, `success` after successful writes, `tap` for lightweight toggles, and `toast` from central toast helpers. Scenario selection for the map belongs in `src/lib/audio/useTripAudioScenario.ts`, with priority `story > overBudget > voteActive > missionActive > idle`; keep new scenario logic there instead of scattering `setScenario` calls.
- `IntroSequence` navigation must stay clamped and ref-driven. Pointer and keyboard events can arrive faster than React commits state, so handlers must read the latest beat from a ref, clamp to the final beat, and make completion idempotent; using captured `beat` plus functional increments can push past the `BEATS` array and crash on `current.cta`.

## Coordinate-Pick UX Pattern

Forms that let users tap the map to set a coordinate use a panel-hide approach so the map is fully accessible:

1. In `TripMap.tsx`, call `setCoordinatePickMode({ label, callback })` and display the pick banner.
2. **If the form is inside a `Sheet`:** pass `className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}` directly to `SheetContent`. Because `SheetContent` renders into a body-level portal, it escapes any `invisible` class on an ancestor element — the class must be on `SheetContent` itself, not on a wrapper div in `TripMap`. For map-adjacent sheets (`showBackdrop={false}`), no changes to the backdrop prop are needed.
3. **If the form is NOT inside a `Sheet`:** wrap the triggering element in `<div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>`. The panel stays **mounted** (preserving form state) but becomes invisible and non-interactive.
4. Always wire the coordinate callback into the form's setter — do NOT close and reopen the panel/sheet; that would lose form state.

`MissionPanel` (Sheet-based) and `RouteVoteProgress` are the two reference implementations.

## Mobile UX Principles

TripMap targets 390px-wide viewports (iPhone 12 Pro class) as the primary form factor. The rules below prevent the most common regressions.

### The map section must be `overflow-hidden`

```tsx
<section className="relative min-h-0 flex-1 overflow-hidden" aria-label="Checkpoint map">
```

This clips all absolutely-positioned children — button clusters, panel overlays, animated banners. Without it, any child that extends past the section boundary creates document-level horizontal scroll. **This is the single most important CSS rule in the map view.** If it's removed, or a new wrapper element is introduced without it, the page scrolls on mobile.

### Map chrome composition (post-rework)

Map controls live in a single horizontal Dock at the bottom plus two corner utilities. There are **no more vertical FAB clusters** — the legacy `bottom-5 left-5` and `bottom-5 right-5` columns have been replaced.

| Region | Position | Contents |
|--------|----------|----------|
| HUD top stack | `inset-x-3 top-3` | `StatusCard` (state + activity), `LivePill` (Traveler only), `FundsCompact` |
| Music indicator | `right-3 top-3` | `MusicMuteIndicator` |
| Map utility | `bottom-[88px] right-3` | `MapCenterButton` (recenter on traveler / last check-in) |
| Bottom Dock | `inset-x-3 bottom-3` | `Dock` (Traveler: Journal · Missions · `+` · Votes · Awards; Follower: Journal · Missions · Votes · Awards) |

The Dock is the single nav surface. Its center `+` is a Traveler-only FAB that opens `FanMenu` (Check-in / Activity / Transaction / Mission / Vote). Followers access Mission proposal from Missions instead of a redundant `+` tab.

Touch targets in the Dock are 44 × 44 px or larger; the FAB is 48 × 48 px and bleeds slightly above the dock baseline. Live the design tokens in `src/styles.css` (`--dock-h`, `--shadow-fab`, `--flag`) — do not hardcode colors at use sites.

When adding a new HUD or Dock control: extend the component in `src/features/hud/` and surface it through `src/features/hud/index.ts`. Do not reintroduce vertical FAB columns.

### All secondary panels are bottom sheets

Map-adjacent panels (Journal, Missions, Route Votes) use `<Sheet side="bottom" modal={false} showBackdrop={false}>`. Never use a left/right sidebar or a `motion.div` with horizontal `x` animation — these temporarily extend document width during the spring, causing the mobile scroll regression.

`SheetContent side="bottom"` has `max-h-[85dvh] inset-x-0 bottom-0 rounded-t-xl` built in (`src/components/ui/sheet.tsx`).

Modal flows (Options, Emergency Reset) keep the default backdrop/modal behavior.

### Mutual panel exclusion

At most one bottom sheet (Journal, Missions, Votes, Funds, Achievements) may be open at a time. The Dock's `onSelect` callback funnels into the existing `open<Panel>` helpers, which use named functions — not raw `setState` on the button `onClick` — to enforce exclusion:

```typescript
function openHistory() {
  if (isHistoryOpen) { setIsHistoryOpen(false); return; }
  setIsHistoryOpen(true);
  setIsMissionsPanelOpen(false);
  setIsVotePanelOpen(false);
}
```

Each helper closes its siblings and toggles itself closed if already open (tap-to-dismiss). `TravelerState` does not participate in exclusion, but Dock tab selection still closes it before opening the requested Dock sheet. It also follows Dock-clearing sheet behavior: the Dock stays visible above it, the sheet surface extends behind the Dock to avoid a map gap, and pinned actions must sit above the Dock via internal footer padding. The Dock's `activeDockTab` is derived directly from the panel open flags so it stays in sync.

When adding a new panel: write an `open<Panel>` helper, call `set<ExistingPanel>Open(false)` for each existing panel inside it, expose a `DockTab` variant if it belongs in the Dock, and update `activeDockTab`/`handleDockSelect` accordingly.

### Toast positioning must clear the Dock

The toast lives at `bottom-[112px]` so it sits above the Dock (~76 px tall) plus the bottom gutter. Role no longer matters — the Dock is the same height for Traveler and Follower. Update the constant if the Dock height changes.

### Sheets must clear the Dock

The Dock is the always-visible mobile navigation layer and should remain above map-adjacent sheets. Do not fix covered footer buttons by raising a sheet above the Dock. For Traveler State specifically, keep the sheet anchored to the viewport bottom so the sheet surface continues behind the Dock, then use internal footer padding (`--dock-h` plus a small gap) so pinned actions sit above the Dock without exposing a map gap.

### MapLibre measurement gotchas

**Viewport height** — `window.innerHeight` is the *layout* viewport; it shrinks when the mobile browser chrome appears. For padding calculations against the map canvas, always use `map.getContainer().clientHeight` (stable, matches the canvas).

**Portal/sheet height** — `SheetContent` renders at body level via a portal; it escapes the React tree. To measure its rendered height, add a `data-role` attribute directly on `SheetContent`:
```tsx
<SheetContent data-role="my-sheet" ...>
```
Then read it from the DOM:
```typescript
const el = document.querySelector('[data-role="my-sheet"]') as HTMLElement | null;
const height = el?.offsetHeight ?? fallback;
```

**Viewport-relative positions** — use `getBoundingClientRect()` for positions relative to the viewport (top, bottom, right, left). Use `clientHeight`/`offsetHeight` for layout dimensions.

**Two-axis encroachment** — when deciding whether to push a pin/element to avoid overlapping UI (e.g. card stack), check **both** axes:
- Horizontal: `cardsRight + margin > mapWidth / 2`
- Vertical: `cardsBottom > pinNaturalY_inViewport`

Only offset when *both* are true. A one-axis check causes unnecessary offsets when cards are collapsed or horizontally narrow.

### Sheet / Dock z-index stacking hierarchy

Non-modal map sheets slide **under** the Dock; modals (Options, Emergency Reset) stay above everything.

| Layer | z-index | Who |
|---|---|---|
| Non-modal sheets (Journal, Missions, Votes, Funds) | z-[10] | mapAdjacent base |
| Story detail / nested sheets | z-[11] | overrides mapAdjacent |
| Add-checkpoint sheet | z-[12] | overrides mapAdjacent |
| FanMenu backdrop | z-[19] | below Dock; catches map clicks |
| Dock pill (mobile) | z-[20] | always above map sheets |
| FanMenu item buttons | z-[21] | above Dock pill |
| Modal sheets (Options, EmergencyReset, etc.) | z-[50] | above all navigation |

**`mapAdjacent` prop on `SheetContent`** (`src/components/ui/sheet.tsx`): adds `z-[10] pb-[100px]` so the sheet floats under the Dock with 100 px of bottom padding to keep scroll content visible above it. Because `className` is last in `cn()`, tailwind-merge lets the caller's explicit `z-[11]`/`z-[12]` win over `mapAdjacent`'s `z-[10]`.

Never move map-adjacent sheets above `z-[20]` to reveal footer controls; that hides or blocks the Dock. If a pinned footer is covered, keep the Dock on top and compensate inside the sheet with footer/scroll padding so the last controls remain reachable.

**Inline `style` overrides CSS classes.** If a `SheetContent` already has an inline `style={{ paddingBottom: "..." }}`, it will clobber the `pb-[100px]` class from `mapAdjacent`. Fix: embed both in the same inline value: `"calc(100px + env(safe-area-inset-bottom))"`. See `RouteVotePanel.tsx` for an example.

### Desktop layout (DesktopMapFrame)

`src/features/layout/DesktopMapFrame.tsx` wraps the map section in a 3-column CSS grid on viewport ≥ 960 px (left rail 88 px / center 1fr / right rail 380 px). The reactive breakpoint is managed by `src/lib/useIsDesktop.ts` (a `matchMedia` listener).

**Currently disabled**: `DESKTOP_LAYOUT_ENABLED = false` at the top of `DesktopMapFrame.tsx` makes the component a passthrough on all viewports. Flip it to `true` in the desktop showcase PR to activate the grid. The full 3-column implementation is preserved in the file.

When `isDesktop` changes (even while the layout is disabled), `TripMap.tsx` calls `mapRef.current.resize()` via `requestAnimationFrame` so MapLibre remeasures the canvas and doesn't go blank.
