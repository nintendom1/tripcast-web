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

## Dependency Installs

Use npm 11.10.0 or newer. The committed `.npmrc` sets `min-release-age=7`, so npm waits 7 days before resolving newly published package versions during installs and dependency updates.

## Run

```bash
npm run dev
```

## Terminology Lint

TripCast keeps product wording aligned with `terminology.config.json` and a checked-in `terminology-baseline.json`.

```bash
npm run lint:terms:report     # print all current findings and exit 0
npm run lint:terms:baseline   # rewrite the checked-in baseline from current findings
npm run lint:terms            # fail only on findings not already in the baseline
```

The linter scans frontend, backend, docs, and tests while excluding generated, vendor, and build output by default. Add narrow allowlist entries in `terminology.config.json` only when a term is intentionally preserved, and include a reason. As each terminology slice is cleaned, run the report, remove the fixed baseline entries by regenerating the baseline, and then run `npm run lint:terms` to confirm no new drift was introduced.

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

### Travel Funds

`src/features/travelfunds/` — trip-wide Travel Funds meter and transaction ledger. The Traveler sees a compact card next to Traveler State and Current Activity (top-left of the map) plus a management sheet reachable from the card's "Manage" button and from Options -> "Manage Travel Funds". Followers see the meter card only, with no management UI, and per-target "Actual cost" totals on completed Mission / Story cards in Journal.

The Add/Edit Transaction form uses **"Local currency per 1 USD"** for the exchange-rate field (spec Option B): `usdAmount = localAmount / localCurrencyPerUsd`. The per-transaction rate is frozen at write time; later edits to other transactions never affect existing rows. Negative `localAmount` is allowed for refunds, credits, and corrections.

`TravelFundsInlineSection` embeds in the Check In form and the Mission detail "Complete" action, mirroring the existing "Also Update Traveler State" collapsable pattern. It emits a discriminated state (`null | { value } | { error }`) so the parent form can block save when partial-but-invalid data is present rather than silently dropping the transaction.

#### Known limitations (tracked)

- **Auto-expand UX watch** for missions without `estimatedCostUsd`. The inline section auto-opens whenever any prefill (title or amount) is provided; if only a title is prefilled, the section requires the user to either fill the amount or collapse before saving. Intentional ("block over silent loss"), but we'll re-evaluate after real usage. Tracked as [#24](https://github.com/nintendom1/tripcast-web/issues/24).

### Emergency Reset

`src/features/privacy/EmergencyResetSheet.tsx` — traveler-only sheet with one grouped destructive action:

- **Delete Shared Trip Data** — removes checkpoints, live location, route votes, traveler state, current activity, and journal in one backend request
- **Log Everyone Off Too** — optional checkbox that invalidates all active sessions in the same reset request

The reset requires an in-UI confirmation tap. On success, the sheet closes and the app shows a status toast over the map. Rate-limit errors surface as an alert.

## UI Overlay Pattern

Use `src/components/ui/sheet.tsx` for sheet, dialog, drawer, and panel overlays so Base UI handles dialog semantics, focus behavior, escape/outside close behavior, and portal structure consistently.

Map-adjacent bottom panels that should leave the map visually available should use `Sheet`/`SheetContent` with `modal={false}` and `showBackdrop={false}`. Modal flows, such as Options and Emergency Reset, should keep the default backdrop/modal behavior. Reserve custom positioned or animated overlays for transient non-dialog UI such as toasts and map placement banners.

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
| `src/features/privacy/EmergencyResetSheet.test.tsx` | Grouped reset mutation, confirmation dialog, error alert |
| `src/App.privacy.test.tsx` | Emergency Reset visibility by role, post-confirm close and toast |
| `src/features/routevote/RouteVoteProgress.detail.test.tsx` | Deleted-vote recovery state, back-navigation |
| `src/features/travelfunds/currency.test.ts` | `formatUsd`, `formatLocal`, `isValidCurrencyCode`, category helpers, option-list invariants |
| `src/features/travelfunds/TravelFundsMeter.test.tsx` | Under-budget fill ratio + color, over-budget cap behavior, no-budget "Spent" mode, ARIA meter attributes |
| `src/features/travelfunds/TravelFundsInlineSection.test.tsx` | Discriminated state emission (`null` / `value` / `error`), auto-expand on meaningful prefill, inline title-required error |

## Debug Logging

TripCast includes a local-only debug logger for reproducing and describing UI bugs to an LLM.

### Enabling

1. Open the app and tap the **settings icon** (top-right).
2. Scroll to **Developer → Dev Tools**.
3. Toggle **Debug Logging** on.

Logging is **off by default**. The toggle state persists across page reloads.

### Reproducing a bug

1. Enable debug logging.
2. Reproduce the steps that trigger the bug (open menus, tap actions, submit forms, etc.).
3. Return to **Options → Dev Tools → Refresh**.
4. Tap **Copy LLM Summary** and paste it into your LLM conversation.

The summary contains:
- A component-to-file path table for every component that fired.
- All warnings and errors highlighted at the top.
- A compact timeline of the last 100 interaction events with inline state snapshots.

**Copy JSON** gives the full structured log. **Download JSON** saves it as a file.

### What is logged

- Sheet / panel open and close (Journal, Missions, Votes, Funds, Options, Check In form, etc.)
- Dock tab selections and FanMenu action picks
- View-mode changes inside panels (list → detail → create)
- Filter tab changes
- Form submit attempts, successes, and errors
- Global `window.onerror` and `unhandledrejection` events
- React render errors (via error boundary)

### What is NOT logged

- Auth tokens, passwords, secrets, API keys, email addresses, or phone numbers — these keys are automatically redacted.
- Raw user-typed text (titles, notes, captions).
- Large objects — depth capped at 4, arrays at 10 items, strings at 200 chars.
- Convex query payloads or backend responses.

### Storage and privacy

Logs live in `localStorage` (`tripcast.debug.logs`) and never leave the browser unless you explicitly copy or download them. The buffer caps at 500 entries (~256 KB); older entries are dropped automatically. **Clear logs** removes the entry immediately.

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
