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

## Run

```bash
npm run dev
```

## Manual Test

- Open the app and verify the map is centered on Seattle.
- Add a pin by right-clicking the map.
- Add a pin with the Add Pin button, then tap the map.
- Refresh and verify saved pins still appear.
- Click or tap a pin and verify title/note appear.
- Try rapid repeated saves and verify errors are shown.
- Test placement mode with browser mobile emulation.
- Confirm `.env` and `.env.local` are not staged.

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

