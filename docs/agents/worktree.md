# Web Worktree Setup

`~/.claude/tools/orch spawn --worktree` does steps 1-3 itself. Do them by hand for any other worktree.

1. Copy `.env.local` from the primary checkout into the worktree, so manual testing does not hit `VITE_CONVEX_URL=` errors.
2. If `node_modules/.bin/tsc` is missing, run `npm install`.
3. Treat `tsc is not recognized` as missing dependencies, not a TypeScript failure.
4. Rerun `npm run validate` after installing.

Do not symlink or reuse `node_modules` across worktrees, especially on Windows.
