# Agent Instructions

## How to Read These Instructions

Rules here encode **specific failure modes that have already occurred** — in production, in a dev session, or in a prior agent run. They are not a feature checklist.

- When a rule seems obvious, assume an agent got it wrong in exactly the way the rule prevents.
- When a component name or constraint is called out explicitly, code once broke in that exact spot.
- Before touching a documented area, read the relevant **Patterns & Gotchas** entry first. The cost is seconds; re-introducing a known bug costs a full debug round.
- When you fix a non-obvious bug or discover a constraint that isn't clear from types alone, **add it to Patterns & Gotchas**. The goal is a shrinking bug surface across sessions, not just within them.

## Feature Branch Policy

- **Never work directly on `main`.** Always create a feature branch before making changes.
- Name feature branches with hyphens only — no slashes. Examples: `feat-mission-lifecycle`, `fix-map-markers`, `chore-update-deps`.
- If you find yourself on `main` at the start of a task, create a feature branch first via `git checkout -b <branch-name>`.
- When creating a frontend git worktree, copy the existing `.env.local` from the primary frontend checkout into the new worktree before running Vite. Keep `.env.local` untracked and never commit it.

## Planning Mode Behavior

- When in planning mode, **ask clarifying questions as needed to explore and refine requirements** before finalizing the plan. Probe for edge cases, prioritization, and constraints the user may not have stated.

- This repo is public.
- Avoid exposing private roadmap, product strategy, or sensitive implementation details, even in commit messages.
- Keep UI barebones for this phase.
- Use Vite, React, and TypeScript.
- Use MapLibre GL JS and do not add paid or token-based map providers.
- Do not commit secrets, `.env`, or `.env.local`.
- Treat secret scanning as part of the normal workflow before commits and PRs.
- Agents are allowed to install Gitleaks when needed to run local scans.
- Run `gitleaks git --config .gitleaks.toml --redact --verbose` before pushing when Gitleaks is available.
- Run `git diff --cached | gitleaks stdin --config .gitleaks.toml --redact --verbose` before committing staged changes when Gitleaks is available.
- If Gitleaks is unavailable and cannot be installed, say so in the final response and rely on the GitHub Actions Gitleaks workflow as the remote check.
- Consume Convex through `src/convex/tripcastApi.ts`. Do not hand-write function references — regenerate this file via `npm run export:web-api` in `tripcast-backend` then copy the output.
- All mutations take an explicit `token` arg for auth. Do not use `clientId`; that field was removed.
- When the backend returns `null` for a route vote detail query, the frontend shows a deleted-vote recovery state ("This route vote was deleted.") with a "Back to votes" button — do not treat this as a loading state.
- Use `react-error-boundary` for React render, lazy import, and Convex `useQuery` thrown-error containment; it does not replace delayed pending/offline UI or local `try/catch` for async mutations and event handlers.
- Keep lazy `TripMap` declared at module scope in `App.tsx`; creating `React.lazy()` inside a component can loop on the Suspense fallback and leave the app stuck at "Loading map...".
- Emergency Reset sheet (`src/features/privacy/EmergencyResetSheet.tsx`) is gated to the `"traveler"` role. It uses one grouped backend reset mutation with a confirmation tap; rate-limit errors from the backend are shown in a `role="alert"` paragraph.
- Avoid unnecessary map remounts, style resets, or tile request loops.
- Backend API changes belong in `tripcast-backend`.
- If stuck after two failed attempts, stop, summarize what failed, and propose a better next attempt.

## Debug Logging (Required for New Features)

TripCast has a local-only debug logger (`src/debug/`) that is always present but disabled by default. **Every new component or feature must instrument itself using this system.** Do not add `console.log` for diagnostic output — use the logger instead.
Any new sheet, panel, modal, drawer, or map-adjacent surface must also register active UI context via `useActiveUiContext` so the floating Debug button and copied summary identify it. Include a human label, implementation sheet/panel name, active view/tab when available, source/opened-by label, file path, and bounds selector. If the surface is nested, register the nested surface too so it can temporarily override the primary sheet while open.

### Quick-start

```tsx
import { useDebugLogger } from "../../debug/useDebugLogger";

export default function MySheet({ ... }) {
  const log = useDebugLogger("MySheet", "src/features/myfeature/MySheet.tsx");
  ...
}
```

### What to log and which helper to use

| Event | Helper | Category |
|-------|--------|----------|
| Sheet or panel opens | `log.logUi("sheet:open", { ... })` | `ui` |
| Sheet closes (backdrop tap) | `log.logUi("sheet:close", { trigger: "backdrop" })` | `ui` |
| User taps a button / selects a tab | `log.logUi("action:name", { ... })` | `ui` |
| Form mount / submit / cancel | `log.logForm("form:open")` / `log.logForm("form:submit")` / `log.logForm("form:cancel")` | `form` |
| Mutation fired | `log.logMutation("mutation:name", { ... })` | `mutation` |
| Mutation succeeded | `log.logMutation("mutation:name:success")` | `mutation` |
| Mutation error | `log.error("mutation:name:error", "mutation", { message: e.message })` | `mutation` |
| Query error (caught) | `log.error("query:name:error", "query", { ... })` | `query` |
| Map camera move (programmatic) | `log.logMap("map:camera:move", { lat, lon, trigger })` | `map` |
| Auth event | `log.logAuth("event:name", { ... })` — details auto-redacted | `auth` |
| State transition worth tracking | `log.logState("stateName", before, after)` | `state` |
| Travel-funds change | `log.logFunds("event:name", { ... })` | `funds` |
| Routing/navigation change | `log.info("route:change", "route", { ... })` | `route` |
| App initialization / page load | `debugLog("info", "App", "app:init", "ui", { online, viewport, hadStoredSession })` | `ui` |
| Transient surface appears (toast/banner) | `log.logUi("x:toast:shown", { text, points, placement, dims, viewport })` | `ui` |
| Tracked domain value changes (score/points/budget) | `log.logUi("x:value:change", { from, to, delta })` (or `log.logState`) | `ui` / `state` |

### Always-in-scope instrumentation for new features

Beyond the per-component basics above, **every new feature must instrument these three lifecycle concerns** — they are the ones most often missing and most useful when debugging on a device you cannot see:

1. **App / feature initialization** — log once on mount / page load (fires on refresh). Include enough context to reconstruct the entry state (viewport, online status, whether a stored session existed, relevant feature flags). See `app:init` in `src/App.tsx`.
2. **Transient UI surfaces (toasts, banners, popovers)** — log when they *appear*, capturing the **rendered text/values, placement, and measured dimensions** (`getBoundingClientRect()` after commit) plus the viewport. Placement/size bugs on mobile are invisible without this. See `achievement:toast:shown` in `src/features/achievements/AchievementsConnected.tsx`.
3. **Tracked value changes** — when a feature surfaces a number the user watches (score/points, budget, counts), log every change with `{ from, to, delta }` (and an `:init` entry on first load). See `achievement:points:change`.

### Required instrumentation for every new sheet or panel

```tsx
useEffect(() => {
  log.logUi(open ? "sheet:open" : "sheet:close");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);

// Also log backdrop close in onOpenChange:
function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen) log.logUi("sheet:close", { trigger: "backdrop" });
  onOpenChange(nextOpen);
}
```

### Rules

- **Always pass the correct category.** Wrong categories break the preset filter (e.g. everything at category `"interaction"` hides behind Interaction Trace only).
- **Never log secrets.** The redaction regex covers `token|secret|password|auth|apikey|api_key|email|phone|bearer|invite|reset` — do not manually pass these fields. For auth events, use `log.logAuth()` which routes to the `auth` category that is enabled in Normal preset; even with redaction active, keep the payload minimal.
- **Register the component.** `useDebugLogger(componentName, filePath)` auto-registers the component in the LLM summary map — always pass the real file path as the second argument.

---

## Debugging Strategy

### Stop-and-log rule
If you have made **two failed attempts** to fix a visual or layout bug — especially one that manifests only on device or in a browser you cannot see — stop writing guesses. Instead:
1. Propose leveraging the debug logger for where the problematic code runs.
2. Ask the developer to trigger the behavior, copy the log output, and paste it back.
3. Only then diagnose and implement the fix.

This one logging round almost always costs less time than a third blind attempt.

### Verify wiring before debugging logic
Before investigating *why* a function produces wrong output, confirm it is actually being called. Put a one-line log at the very **first line** of the function — before any early returns or guards — so a missing call is immediately obvious:

```typescript
// Put relevant logging here
const map = mapRef.current;
if (!map) return;       // ← guard comes after the entry log
```

A common failure mode: a new handler is defined but the component prop still references the old one. The entry log catches this in one round.

## Commits And PRs

- Conventional Commits prefix, lowercase type/scope (i.e. `feat: `, `fix: `, `docs: `, `chore: `, `refactor: `, `dev: `).
- Subject after colon: imperative Title Case.
- For the commit body and PR Before/After, follow this style:
```text
Before, <describe the previous state or problem>.
Now, <describe the new state or outcome>.
```
  Apply these rules when writing the Before/After:
  1. **Cover the full scope.** For a PR, the Before/After must mention every major feature or fix on the branch — not just the most recent commits. Omitting a feature is a deficiency.
  2. **Name affected roles explicitly.** This app has two distinct roles: Traveler and Follower. When a change affects either role's experience, name the role and describe what they gain or lose. Do not write in a role-neutral voice if the feature is role-specific.
  3. **Lead with the most impactful perspective.** Put the primary beneficiary — the role whose experience changes most — first in the Before/After. Secondary roles follow.
  4. **Write a unified narrative, not a list.** The Before/After paragraph should read as a story about what users could and couldn't do, not as a bullet summary of technical changes. Reserve bullets for the Summary section.
- PR title uses the same style. PR body template:
```text
<Before/After commit body style.>

## Summary
<Up to several technical bullets.>

## Testing
<Commands run, manual checks performed by you and/or a reviewer, or note why testing was not run.>
```

## Validation (Required Before Claiming Completion)

Run the full validation suite before reporting a task as done:

```bash
npm run validate
```

This runs typecheck → lint → tests in sequence and short-circuits on the first failure.
Individual scripts are still available: `npm run typecheck`, `npm run lint`, `npm run test`.

**Do not claim a task complete until `npm run validate` passes.**

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
| Bottom Dock | `inset-x-3 bottom-3` | `Dock` (Story · Missions · `+` · Votes · Funds) |

The Dock is the single nav surface. Its center `+` is a FAB: Traveler opens `FanMenu` (Check-in / Activity / Transaction / Mission / Vote); Followers go straight to "Propose Mission" (no fan).

Touch targets in the Dock are 44 × 44 px or larger; the FAB is 48 × 48 px and bleeds slightly above the dock baseline. Live the design tokens in `src/styles.css` (`--dock-h`, `--shadow-fab`, `--flag`) — do not hardcode colors at use sites.

When adding a new HUD or Dock control: extend the component in `src/features/hud/` and surface it through `src/features/hud/index.ts`. Do not reintroduce vertical FAB columns.

### All secondary panels are bottom sheets

Map-adjacent panels (Journal, Missions, Route Votes) use `<Sheet side="bottom" modal={false} showBackdrop={false}>`. Never use a left/right sidebar or a `motion.div` with horizontal `x` animation — these temporarily extend document width during the spring, causing the mobile scroll regression.

`SheetContent side="bottom"` has `max-h-[85dvh] inset-x-0 bottom-0 rounded-t-xl` built in (`src/components/ui/sheet.tsx`).

Modal flows (Options, Emergency Reset) keep the default backdrop/modal behavior.

### Mutual panel exclusion

At most one bottom sheet (Journal, Missions, Votes, Funds) may be open at a time. The Dock's `onSelect` callback funnels into the existing `open<Panel>` helpers, which use named functions — not raw `setState` on the button `onClick` — to enforce exclusion:

```typescript
function openHistory() {
  if (isHistoryOpen) { setIsHistoryOpen(false); return; }
  setIsHistoryOpen(true);
  setIsMissionsPanelOpen(false);
  setIsVotePanelOpen(false);
}
```

Each helper closes its siblings and toggles itself closed if already open (tap-to-dismiss). `TravelerState` is a full-height dialog and does not participate in exclusion. The Dock's `activeDockTab` is derived directly from the panel open flags so it stays in sync.

When adding a new panel: write an `open<Panel>` helper, call `set<ExistingPanel>Open(false)` for each existing panel inside it, expose a `DockTab` variant if it belongs in the Dock, and update `activeDockTab`/`handleDockSelect` accordingly.

### Toast positioning must clear the Dock

The toast lives at `bottom-[112px]` so it sits above the Dock (~76 px tall) plus the bottom gutter. Role no longer matters — the Dock is the same height for Traveler and Follower. Update the constant if the Dock height changes.

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
