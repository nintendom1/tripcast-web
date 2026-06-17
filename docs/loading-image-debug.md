# LoadingImage Debug Simulation

`src/components/ui/LoadingImage.tsx` reserves layout space with an
aspect-ratio container, shows a spinner while the image downloads, fades it
in on load, and renders an error state on failure. On a fast localhost,
images resolve from disk/cache almost instantly, so the spinner, fade-in, and
error states flash by too fast to inspect.

Two Vite env vars make those states exercisable. Both default to `0` (no-op)
and only affect the dev server. Set them in `.env.local`:

```
VITE_IMAGE_LOAD_SLOW_MS=1500   # ms to hold the spinner before fading the image in
VITE_IMAGE_LOAD_FAIL_RATE=0.2  # 0..1; probability each image is forced to the error state
```

Behavior:
- **`SLOW_MS`** delays only the visual transition to "loaded", so the spinner
  and the 0.3s opacity fade-in become visible at human timescales. The real
  `onLoad` callback still fires immediately, so consumers that read the
  image's natural dimensions (e.g. `ReplayPoiCard`) are unaffected.
- **`FAIL_RATE`** forces a fraction of images into the "Failed to load" state
  even though the bytes arrived — letting you inspect the error placeholder
  (and its `onError` side effects) without pointing at a broken URL.

A `console.info("[LoadingImage SIM] …")` line is printed once on app start
when either var is non-zero, so you can confirm sim mode is active without
re-reading `.env.local`.

Both knobs apply to every `LoadingImage` in the app (story feed, draft
previews, replay POI card). They do not affect Storybook, where the `status`
prop override already renders the loading/error states deterministically.
