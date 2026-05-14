# TripCast Web

Map checkpoint prototype.

## Setup

```bash
npm install
```

Create `.env.local`:

```bash
VITE_CONVEX_URL=
```

The backend functions live in a separate private repo.

Do not commit `.env` or `.env.local`. Keep real Convex URLs in `.env.local`; committed files should only use empty placeholders such as `VITE_CONVEX_URL=`.

## NPM Supply-Chain Hardening

This repo has local npm defaults and a lockfile scanner to reduce the risk from attacks like the Mini Shai-Hulud npm campaign, where compromised packages used install-time scripts and GitHub-hosted optional dependencies to spread through developer machines and CI.

The committed `.npmrc` disables lifecycle scripts by default, blocks Git dependency specs, saves exact dependency versions, and leaves npm audit enabled. If a dependency genuinely requires install scripts, review the package first and run the install with an explicit one-off override instead of changing the repo default.

Before installing changed dependencies, reviewing a dependency PR, or pushing dependency updates, run:

```bash
npm run security:supply-chain
```

The guard rejects known compromised package versions from the Mini Shai-Hulud report, direct Git/GitHub/URL/file dependency specs, the `@tanstack/setup` optional dependency vector, and unexpected install lifecycle scripts. The deploy workflow runs this check before `npm ci`.

## Run

```bash
npm run dev
```

## Deployment

GitHub Pages builds the app with Vite, so `VITE_CONVEX_URL` is embedded into the generated JavaScript at build time. Use the Convex production deployment URL, omit any trailing slash, and rerun the Pages workflow after changing the GitHub variable or secret.

For GitHub Pages project hosting at `https://nintendom1.github.io/tripcast-web/`, Vite must use `base: "/tripcast-web/"`. When publishing from a custom domain, switch the Vite base back to `/`.

If `VITE_CONVEX_URL` is stored as a GitHub Environment variable, the workflow job that runs `npm run build` must declare that environment. If only the deploy job declares the environment, the build job will not receive the value.

### Deployment Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/assets/index...js` returns 404 on GitHub Pages | Vite `base` does not match the GitHub Pages project path |
| App shows `VITE_CONVEX_URL is not set` | The build job did not receive the variable, or Pages was not rebuilt after setting it |
| WebSocket URL contains `cloud//api` | `VITE_CONVEX_URL` has a trailing slash |
| Convex says it cannot find `auth:signIn` | The frontend points at a Convex deployment that does not have the backend functions deployed |
| Sign-in fails | Check the selected role, Convex production auth env vars, and sign-in rate limits |

## Auth Flow

Sessions are role-gated. A token is stored in `localStorage` after login. Every mutation and query passes `token` explicitly — there is no cookie-based auth. Roles are `"traveler"` (full write access, emergency reset) or `"support_crew"` (read + vote access only).

## Features

### Route Vote

`src/features/routevote/` — the traveler proposes destination options and support crew votes. The traveler sees live results; support crew results visibility depends on the vote's `resultsVisibility` setting. When the backend returns `null` for a detail query (vote was deleted), the UI shows a deleted-vote recovery screen with a "Back to votes" button.

### Emergency Reset

`src/features/privacy/EmergencyResetSheet.tsx` — traveler-only sheet with four destructive actions:

- **Delete Checkpoints** — removes all shared checkpoint data
- **Clear Live Location** — removes the stored traveler GPS position
- **Delete All Trip Data** — wipes all trip-related tables at once
- **Log Everyone Off** — invalidates all active sessions including support crew

Each action requires an in-UI confirmation tap. Rate-limit errors surface as an alert.

## Manual Test

- Open the app and verify the map is centered on Seattle.
- Add a pin by right-clicking the map.
- Add a pin with the Add Pin button, then tap the map.
- Refresh and verify saved pins still appear.
- Click or tap a pin and verify title/note appear.
- Try rapid repeated saves and verify errors are shown.
- Test placement mode with browser mobile emulation.
- Confirm `.env` and `.env.local` are not staged.

## Testing

Run the unit and component test suite:

```bash
npm run test
```

Test runner: `vitest` with `jsdom` environment. React components use `@testing-library/react` and `@testing-library/user-event`. `convex/react` hooks are mocked via `vi.mock` — no Convex deployment required.

| File | Coverage |
|---|---|
| `src/lib/routeVoteUtils.test.ts` | `formatTimeRemaining`, `computeEffectiveStatusClient`, `formatVotePct`, `haversineDistanceMiles` |
| `src/features/privacy/EmergencyResetSheet.test.tsx` | All four actions, confirmation dialog, error alert |
| `src/App.privacy.test.tsx` | Emergency Reset button visibility by role |
| `src/features/routevote/RouteVoteProgress.detail.test.tsx` | Deleted-vote recovery state, back-navigation |

## Secret Scanning

This repo runs Gitleaks in GitHub Actions on pushes, pull requests, and manual workflow runs. The workflow checks full git history and redacts detected secret values from logs.

Install Gitleaks locally and make scanning part of the normal commit workflow:

```powershell
winget install Gitleaks.Gitleaks
gitleaks version
```

On systems without Winget, use the install instructions from the Gitleaks release page.

Before pushing, run a full repository scan:

```bash
gitleaks git --config .gitleaks.toml --redact --verbose
```

Before committing, scan staged changes:

```bash
git diff --cached | gitleaks stdin --config .gitleaks.toml --redact --verbose
```

Keep real Convex deployment and site URLs out of committed files. `.gitleaks.toml` includes a TripCast rule that flags `convex.cloud` and `convex.site` URLs anywhere in committed content.

Enable GitHub secret scanning and push protection in the repository settings.

