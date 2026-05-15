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

`src/features/privacy/EmergencyResetSheet.tsx` — traveler-only sheet with one grouped destructive action:

- **Delete Shared Trip Data** — removes checkpoints, live location, route votes, traveler state, current activity, and history in one backend request
- **Log Everyone Off Too** — optional checkbox that invalidates all active sessions in the same reset request

The reset requires an in-UI confirmation tap. On success, the sheet closes and the app shows a status toast over the map. Rate-limit errors surface as an alert.

## UI Overlay Pattern

Use `src/components/ui/sheet.tsx` for sheet, dialog, drawer, and panel overlays so Base UI handles dialog semantics, focus behavior, escape/outside close behavior, and portal structure consistently.

Map-adjacent bottom panels that should leave the map visually available should use `Sheet`/`SheetContent` with `modal={false}` and `showBackdrop={false}`. Modal flows, such as Options and Emergency Reset, should keep the default backdrop/modal behavior. Reserve custom positioned or animated overlays for transient non-dialog UI such as toasts and map placement banners.

### Overlay Animation Strategy

For map-adjacent panels that need custom slide or fade motion:

1. Keep `Sheet` and `SheetContent` as the accessibility and portal shell.
2. Use `modal={false}` and `showBackdrop={false}` when the map should remain visible and interactive.
3. Put `framer-motion` on an inner wrapper (`motion.div`) inside `SheetContent`, not on `SheetContent` itself.
4. Set `SheetContent` to a transparent shell (`bg-transparent`, no border/shadow/padding) and apply panel visuals on the animated inner wrapper.
5. Keep panel placement classes (`bottom`, `left`, compact/fullsreen sizing) on the animated inner wrapper so animations and layout do not fight side presets.

This keeps Base UI semantics while preserving prior slide-in/out behavior and avoids remount or double-backdrop regressions.

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
