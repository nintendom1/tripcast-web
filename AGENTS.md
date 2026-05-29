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
- **Roles**: Traveler (admin/write access) and Follower (read/vote access).
- **Backend**: Convex functions are owned by `tripcast-backend`.

## Setup & Validation

- **Install**: `npm install`
- **Run**: `npm run dev`
- **Validation**: `npm run validate` (typecheck -> lint -> tests)
- **Testing**: `npm run test` (Vitest with `jsdom`)

`npm run dev` is available for local development but not available for agents.

Do not claim a code task complete until `npm run validate` passes.

## Read-On-Demand Agent Procedures

Do not read these files by default. Read them only when relevant.

- `docs/agents/commit-and-pr.md`: committing, writing commit messages, creating PRs, reviewing PR scope.
- `docs/agents/quiet-mode.md`: Quiet Mode, silent mode, or reduced progress chatter.
- `docs/agents/run-continuously.md`: autonomous or continuous work.
- `docs/agents/validation.md`: before claiming frontend changes are complete.
- `docs/agents/visual-testing.md`: Playwright or visual regression work.
- `docs/agents/debug-log.md`: changing debug logging or using logs to reproduce UI bugs.
- `docs/agents/terminology.md`: terminology, UI copy, or terminology lint changes.
- `docs/agents/implementation-gotchas.md`: map, sheet, auth/API, travel funds, or other known frontend failure modes.

## Non-Negotiables

- Never work directly on `main`; create a hyphenated feature branch if needed.
- Use TypeScript strictly and keep hook calls before early returns.
- Use `react-error-boundary` for React render, lazy import, and Convex `useQuery` thrown-error containment.
- Consume Convex through `src/convex/tripcastApi.ts`; backend API changes belong in `tripcast-backend`.
- Do not hand-write Convex function references. Regenerate in backend with `npm run export:web-api`, then copy the generated file.
- All Convex calls that require auth pass an explicit `token`; do not use `clientId`.
- Do not commit secrets, `.env`, or `.env.local`; treat Gitleaks scanning as part of commit/PR work.
- Keep UI barebones for this phase and use MapLibre GL JS; do not add paid or token-based map providers.
- If stuck after two failed attempts, stop, summarize what failed, and propose the next attempt.

## Worktree Setup

When creating a frontend git worktree:

1. Copy `.env.local` from the primary frontend checkout into the new worktree. This is to prevent VITE_CONVEX_URL= errors when the developer manually tests.
2. Check whether `node_modules/.bin/tsc` exists.
3. If missing, run `npm install`.
4. Treat `tsc is not recognized` as missing dependencies, not as a TypeScript failure.
5. Rerun `npm run validate` after installing dependencies.

Do not symlink or reuse `node_modules` across worktrees by default, especially on Windows.

## Planning Mode Behavior
Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Include file names.
Have a section for UX flow to understand where/how the app user will interact with it.
Ask clarifying questions — one at a time, understand purpose/constraints/success criteria
Ambiguity check: Could any requirement be interpreted two different ways? If so, pick one and make it explicit.
Write design doc — save to plans/YYYY-MM-DD-<topic>-design.md
User reviews written spec — ask user to review the spec file before proceeding

## Developer Preferences
* Defer Unit Tests until the Developer has manually verified the implementation unless instructed otherwise. 