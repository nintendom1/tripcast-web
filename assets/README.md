# App icon & splash source images

`@capacitor/assets` generates all iOS app-icon sizes and the splash imageset from the source
images in this folder. Drop these in, then run `npm run ios:assets` (on the Mac), then commit the
regenerated files under `ios/App/App/Assets.xcassets/`.

Required / optional sources:

- `icon.png` — **1024×1024**, square, **no transparency** (iOS rejects transparent app icons).
  This is the only required file.
- `splash.png` — optional, **2732×2732**, artwork centered (safe zone ~1200×1200). Used for the
  launch screen. If omitted, the existing scaffold splash is kept.
- `splash-dark.png` — optional dark-mode splash, same size.

Generate:

```bash
cd tripcast-web
npm run ios:assets          # capacitor-assets generate --ios
```

Then in Xcode confirm the App Icon set is populated, rebuild with `npm run ios:run`, and
`git add ios/App/App/Assets.xcassets assets/` to commit both the sources and generated output.
