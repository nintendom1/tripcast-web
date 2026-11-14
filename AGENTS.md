# TripCast Web: Canonical Contract

## Worker Contract

When given a brief path, you are a worker:
- Follow the brief and your role file (Claude: `~/.claude/agents/`); do not orchestrate, plan or ask the owner.
- Own only the files the brief lists; report anything else under Requests.
- Never commit, push, stash, reset, or deploy.
- Finish with the report and one line: `DONE <path>` or `BLOCKED <path>`.

## Non-Negotiables

- Never work directly on `main`; create a hyphenated feature branch if needed.
- Use TypeScript strictly and keep hook calls before early returns.
- Use `react-error-boundary` for React render, lazy import, and Convex `useQuery` thrown-error containment.
- Consume Convex through `src/convex/tripcastApi.ts`; backend API changes belong in `tripcast-backend`.
- Do not hand-write Convex function references. Regenerate in backend with `npm run export:web-api`, then copy the generated file.
- Before changing native iOS behavior, a public backend API, or Traveler-produced data consumed by Followers, compare both repos against `main`: the iOS code on `main` must still write to the candidate backend and the Follower web code on `main` must still query and render the data. Removed or newly required arguments, renamed functions, changed field types/nullability, and new unhandled enum values are breaking unless the user approves a coordinated rollout.
- All Convex calls that require auth pass an explicit `token`; do not use `clientId`.
- Do not commit secrets, `.env`, or `.env.local`. Gitleaks is part of commit/PR work: before pushing run `gitleaks git --config .gitleaks.toml --redact --verbose .` (CI scans full history). In docs use placeholders the `tripcast-convex-url` rule won't match, e.g. `https://<your-slug>.convex.cloud`.
- Keep UI barebones for this phase and use MapLibre GL JS; do not add paid or token-based map providers.
- After two failed attempts, stop, summarize what failed, and propose the next attempt.

## Four Principles

1. Think Before Coding: state assumptions, surface tradeoffs.
2. Simplicity First: minimum code that solves the problem; nothing speculative.
3. Surgical Changes: touch only what you must; clean up only your own mess.
4. Goal-Driven Execution: define success criteria; loop until verified.

## Project

React/Vite frontend (MapLibre GL JS, Base UI). Roles: Traveler (admin/write), Follower (read/vote). Convex functions belong to `tripcast-backend`.

## Commands

- `npm install`. `npm run dev` exists but is not available to agents.
- `npm run -s v` validates quietly with one OK or FAIL line; `-- --fast` skips the Storybook project while iterating.
- Before claiming a code task complete, `npm run validate` must pass (`lint:terms:report`, `tsc -b`, `eslint .`, `vitest run`).
- `node scripts/agent/trip-audit.mjs` counts raw trip calls that bypass `useTripQuery`/`useTripMutation`; `scope.mjs <brief.md>` checks changes against OWNED.

## Read On Demand

| File | Read when |
|---|---|
| `commit-and-pr.md` | committing, PRs |
| `quiet-mode.md` | Quiet Mode |
| `run-continuously.md` | autonomous work |
| `validation.md` | before claiming work complete |
| `visual-testing.md` | Playwright or visual regression |
| `debug-log.md` | debug logging, reproducing UI bugs |
| `terminology.md` | UI copy, terminology lint |
| `implementation-gotchas.md` | map, sheet, auth/API, travel funds, known failure modes |
| `worktree.md` | creating a git worktree |

All under `docs/agents/`.

## Developer Preferences

* Defer Unit Tests until the Developer has manually verified the implementation, unless instructed otherwise or a brief or role file says tests ship with the work. Storybook stories are written with the implementation unless a brief says otherwise.
* If work started on a branch not on main, stop and tell the user, unless a brief names the branch.
