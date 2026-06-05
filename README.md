# TripCast Web

React/Vite frontend for the TripCast map checkpoint prototype.

## Setup

```bash
npm install
```

Create `.env.local`:

```bash
VITE_CONVEX_URL=
```

Do not commit `.env` or `.env.local`. Keep real Convex URLs in local env files or encrypted GitHub settings.

## Environment Variables

- `VITE_CONVEX_URL`: The URL of your Convex deployment (e.g., `https://<your-slug>.convex.cloud`).
- `VITE_PUBLIC_APP_URL`: The base URL used for generating shareable links (like Follower invites).
  - **Precedence**: If set in any `.env` file (like `.env.local`), it takes absolute precedence.
  - **iOS/Capacitor Note**: If you set this to `http://localhost:5173` in `.env.local`, your iOS builds will generate `localhost` links because they share that environment file.
  - **Fallback**: If omitted, the app automatically defaults to:
    - `https://nintendom1.github.io/tripcast-web/` for production Capacitor builds.
    - `window.location.origin` + `Vite base` for web builds.
  - **Recommendation**: Leave `VITE_PUBLIC_APP_URL` unset in your local `.env.local` to let the automatic fallback handle both local web dev and iOS builds correctly.

## Run

```bash
npm run dev
```

## Validate

```bash
npm run validate
```

Validation runs typecheck, lint, terminology reporting, and tests. Unit/component tests use Vitest with `jsdom`, React Testing Library, and mocked `convex/react` hooks.

## Dependency Installs

Use npm 11.10.0 or newer. The committed `.npmrc` sets `min-release-age=7`, so npm waits 7 days before resolving newly published package versions during installs and dependency updates.

## Features

- **Auth**: Sessions are role-gated. Every Convex call passes a `token` explicitly. Roles are `"traveler"` and `"follower"`.
- **Map**: MapLibre GL JS renders the shared trip map and checkpoint/story locations.
- **Route Vote**: The Traveler proposes destinations; Followers vote. Deleted vote details render a recovery state with "Back to votes".
- **Travel Funds**: The Traveler manages the budget and transactions. Followers see the meter and public per-target actual costs. Exchange rates use "Local currency per 1 USD"; inline cost entry auto-opens only when a meaningful amount is prefilled.
- **Emergency Reset**: Traveler-only sheet for grouped trip-data deletion, with optional session invalidation.
- **Debug Logging**: Local-only Dev Tools logging helps reproduce UI bugs without recording secrets or raw user text.

## Deployment

GitHub Pages builds the app with Vite, so `VITE_CONVEX_URL` is embedded into generated JavaScript at build time. Use the Convex production deployment URL, omit any trailing slash, and rerun the Pages workflow after changing the variable or secret.

For GitHub Pages project hosting at `https://nintendom1.github.io/tripcast-web/`, Vite must use `base: "/tripcast-web/"`. For a custom domain, switch the Vite base back to `/`.

| Symptom | Likely cause |
|---|---|
| `/assets/index...js` returns 404 | Vite `base` does not match the Pages project path |
| App shows `VITE_CONVEX_URL is not set` | **Resolution**: Ensure `tripcast-web/.env.local` exists and contains a valid `VITE_CONVEX_URL`. If running locally, copy the URL from `tripcast-backend/.env.local` (usually `http://127.0.0.1:3210`). |
| App shows `VITE_CONVEX_URL is not set. Configure Convex to use TripCast.` | **Resolution**: Same as above. This error means the frontend cannot find the backend API. Create `tripcast-web/.env.local` with your Convex URL. |
| WebSocket URL contains `cloud//api` | `VITE_CONVEX_URL` has a trailing slash |
| Convex cannot find `auth:signIn` | Frontend points at the wrong or undeployed Convex deployment |

## Terminology Lint

```bash
npm run lint:terms:report
npm run lint:terms:baseline
npm run lint:terms
```

Use the baseline command only after an intentional terminology cleanup.

## Secret Scanning

This repo runs Gitleaks in GitHub Actions. CI scans the full history of the pushed/PR ref, so a clean working tree is not enough — a flagged string in any reachable commit will fail the workflow.

To reproduce the CI scan locally (full history, matches `.github/workflows/gitleaks.yml`):

```bash
gitleaks git --config .gitleaks.toml --redact --verbose .
```

Faster pre-commit check on staged changes only:

```bash
git diff --cached | gitleaks stdin --config .gitleaks.toml --redact --verbose
```

Keep real Convex deployment URLs, site URLs, and secrets out of committed files. In docs and examples, use placeholders the rule won't match — angle-bracket forms like `https://<your-slug>.convex.cloud` are safe because the `[a-z0-9-]` character class excludes `<` and `>`.
