# Agent Instructions

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
- Consume Convex through `src/convex/tripcastApi.ts`.
- Generate and send `clientId` for write mutations that require rate limiting.
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
