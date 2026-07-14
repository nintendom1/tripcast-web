# Replay Stress Fixture

Use the repository generator to create a JSON file of Live Trail breadcrumbs for testing progressive Replay loading. The generated file uses the same format as **Options → Data / Dev → Bulk Import**, so it exercises the real Convex pagination and Replay loading path.

## Generate a fixture

From `tripcast-web`:

```bash
npm run fixture:replay -- --output /tmp/tripcast-replay-stress.json
```

The default fixture contains 100 breadcrumbs, spaced 10 seconds apart along a deterministic Seattle route. One hundred entries fit in a single Bulk Import commit while crossing Replay's 64-row page boundary.

Useful variations:

```bash
# A shorter boundary check
npm run fixture:replay -- --count 65 --output /tmp/tripcast-replay-65.json

# A slower two-hour route over a custom coordinate range
npm run fixture:replay -- \
  --count 100 \
  --interval-seconds 75 \
  --start-at 2026-07-15T09:00:00+09:00 \
  --start-lat 35.6812 \
  --start-lon 139.7671 \
  --end-lat 35.7101 \
  --end-lon 139.8107 \
  --output /tmp/tripcast-replay-tokyo.json
```

Run `npm run fixture:replay -- --help` for every option. Existing files are preserved unless `--force` is supplied.

## Import and test

1. Sign in as the Traveler.
2. Open **Options → Data / Dev → Bulk Import**.
3. Paste the generated JSON, review the preview, and commit the import.
4. Close any active Replay.
5. Enable debug logging and clear the current log.
6. Start Replay with **Beginning** or a **Custom Range** covering the fixture. **Recent** intentionally limits itself to roughly 50 pins and is not suitable for testing forward progressive loading.
7. Search the debug output for `replay:load:` and `replay:buffer:` events.

At 1× speed, 100 breadcrumbs provide about 20 seconds of breadcrumb playback. Higher Replay speeds consume the buffer faster and make prefetch boundaries easier to exercise.

## Generate more than 100 breadcrumbs

Bulk Import accepts at most 100 entries per commit. Generate multiple files with consecutive time ranges and import them in chronological order. For example, generate the first file with an explicit `--start-at`, then start the next file after the first file's printed ending timestamp.

## Cleanup

Each import inserts new breadcrumb rows; importing the same file twice is not idempotent. Record the time range printed by the generator, then remove the fixture from **Options → Live Trail → Delete breadcrumbs in Range** after testing.
