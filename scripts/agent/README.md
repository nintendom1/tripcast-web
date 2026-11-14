# Agent scripts

Small CLIs so agents read a few lines instead of thousands. Each takes `--help`.

- `npm run -s v` runs the `validate` steps quietly (terms, tsc, eslint, vitest): one `OK ...` line, or `FAIL <step>` with 60 lines max and a log path under `.orchestration/logs/`. Without `-s`, npm adds a 3-line banner.
- `npm run -s v -- --fast` runs vitest with `--project=node` only, skipping the Playwright-backed `storybook` project. Run the full `npm run -s v` before finishing.
- A failing vitest step re-runs only its failed files once, serially, in their project; if they pass the OK line says `green only on isolated re-run: <files>`. `--no-retry` disables it.
- `npm run -s v -- --files a.ts,b.ts` runs `vitest related` for those files in the `node` project (the OK line says `(related)`). A missing file exits 2.
- `npm run -s v -- --step eslint` runs one step (`terms`, `tsc`, `eslint`, `vitest`). eslint failures print `file:line rule message`.
- `node scripts/agent/trip-audit.mjs [--files a,b] [--folders] [--json]` counts `rawTripCall`: `useQuery`/`useMutation`/`usePaginatedQuery`/`useAction` from `convex/react`, or `.query(`/`.mutation(`/`.action(`, on a `tripcastApi` ref whose args take `tripId`. Those belong in `useTripQuery`/`useTripMutation`/`useTripConvex` (`src/convex/useTrip.ts`, exempt). Calls whose ref is not statically known (prop, argument, call result) print as `unresolved=<n>`, never ignored. `--assume-all` counts every ref as trip-scoped. Prints files with hits, then `TOTAL rawTripCall=<n> unresolved=<n>`. `--folders` adds informational `hooks=<n>` per feature folder. A `--files` path that was not scanned exits 2.
- `node scripts/agent/scope.mjs <brief.md> [--base <ref>]` checks changed paths against the brief's `OWNED:` line: first backtick span per comma item, `!glob` excludes; exit 2 on usage errors.

Scans `src/**/*.{ts,tsx}` minus tests, stories, `src/test/`, `tripcastApi.ts`. Static heuristic: refs held in objects, destructured, or passed through helpers are not seen.
Tests: `scripts/agent/agent-tools.test.mjs` (picked up by the vitest `node` project).
