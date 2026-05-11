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

