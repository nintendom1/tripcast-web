# Agent Instructions

## Feature Branch Policy

- **Never work directly on `main`.** Always create a feature branch before making changes.
- Name feature branches with hyphens only — no slashes. Examples: `feat-challenge-lifecycle`, `fix-map-markers`, `chore-update-deps`.
- If you find yourself on `main` at the start of a task, create a feature branch first via `git checkout -b <branch-name>`.

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
- Emergency Reset sheet (`src/features/privacy/EmergencyResetSheet.tsx`) is gated to the `"traveler"` role. It uses one grouped backend reset mutation with a confirmation tap; rate-limit errors from the backend are shown in a `role="alert"` paragraph.
- Avoid unnecessary map remounts, style resets, or tile request loops.
- Backend API changes belong in `tripcast-backend`.
- If stuck after two failed attempts, stop, summarize what failed, and propose a better next attempt.

## Commits And PRs

- Conventional Commits prefix, lowercase type/scope (i.e. `feat: `, `fix: `, `docs: `, `chore: `, `refactor: `, `dev: `).
- Subject after colon: imperative Title Case.
- For the commit body, follow this style:
```text
Before, <describe the previous state or problem. Focus on the User Experience if applicable>.
Now, <describe the new state or outcome. Focus on the User Experience if applicable>.
```
- PR title uses the same style. PR body template:
```text
<Before/After commit body style.>

## Summary
<Up to several technical bullets.>

## Testing
<Commands run, manual checks performed by you and/or a reviewer, or note why testing was not run.>
```

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
- History events are fetched in `TripMap.tsx`, not inside `HistoryPanel` — one Convex subscription drives both the panel and the unread badge. Do not move the query into the panel.
- `CheckInDetailSheet` auto-focuses the map on mount via `useEffect` when `lat`/`lon` are present.
- Unread history state is tracked in `localStorage` under the key `tripcast.historyLastReadAt` (`src/features/history/useHistoryUnread.ts`).
- `TravelerStateCard` and `CurrentActivityCard` share a positioning wrapper in `TripMap.tsx` (`absolute top-5 left-5 z-[2] flex flex-col gap-2`). Neither card carries its own absolute positioning.

## Coordinate-Pick UX Pattern

Forms that let users tap the map to set a coordinate use a panel-hide approach so the map is fully accessible:

1. In `TripMap.tsx`, call `setCoordinatePickMode({ label, callback })` and display the pick banner.
2. Wrap the triggering panel in a `<div className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}>` — the panel stays **mounted** (preserving form state) but becomes invisible and non-interactive.
3. Because `Sheet`/`SheetContent` renders into a portal (body level), it escapes the parent `invisible` class. If the form is inside a `Sheet`, also pass `showBackdrop={!isPickingCoordinate}` and `className={isPickingCoordinate ? "invisible pointer-events-none" : undefined}` directly to `SheetContent`.
4. `RouteVoteProgress` (line ~927 in `TripMap.tsx`) is the reference implementation. `ChallengePanel` follows the same pattern.
5. Always wire the coordinate callback so it fires into the form's setter — do NOT close and reopen the panel/sheet; that would lose form state.
