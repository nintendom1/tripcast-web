# Visual Testing (Playwright) — Agentic SOP

How an agent should visually verify UI changes in the running app, autonomously,
without the Claude-in-Chrome browser plugin (it has been unreliable here). Drive a
real browser with **Playwright** instead, capture screenshots + DOM geometry, and
iterate against measurements rather than vibes.

## Principles

- **Playwright, not the Chrome plugin.** `@playwright/test` + `playwright` are already
  dev dependencies; the Chromium build is installed. Do not use `mcp__claude-in-chrome__*`.
- **Mobile-first.** Primary viewport is **390×844** (390px wide is the contract). Spot-check
  desktop only when the change is desktop-specific.
- **Measure, don't guess.** Pixel-tuning overlay/centering from a blurry screenshot is slow and
  wrong. Read `getBoundingClientRect()` for the elements that must not collide, and assert the
  numeric relationships (e.g. `card.bottom < pin.top`). Use screenshots to confirm composition,
  numbers to drive edits.
- **Add durable DOM hooks.** When you need to locate something repeatedly, add a stable
  `data-*` attribute in the source (e.g. `data-replay-poi`, `data-replay-hud`) rather than
  matching Tailwind classes. These double as test selectors later.
- **Don't loop blindly.** If two tuning passes don't converge, stop and ask the human. Don't
  retry the same failing action repeatedly.

## Prerequisites

- The dev server must be running: **`npm run dev` is agent-restricted** — ask the human to start
  it and confirm the URL. Default is `http://localhost:5173/tripcast-web/` (note the
  `/tripcast-web/` base from `vite.config.ts`). Probe before driving:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/tripcast-web/`.
- Auth: sign in as **Traveler**. From the default Follower screen, click **"Sign in as Traveler"**,
  type the traveler code into the **"Enter code"** field, click **"Sign in"**. The code lives in
  **`.local.auth.md` at the workspace root** (`c:\repos\tripcast\.local.auth.md`, gitignored) — note
  this is one level **above** `tripcast-web/`. If the value reads like a placeholder, ask the human.
  A saved Playwright session may exist at `tripcast-web/.playwright-session.json`, but it has been a
  **Follower** token — re-auth as Traveler for replay/trail flows.
- **Rendering — pick the GL backend by mode:**
  - **Headed (human supervising):** launch `headless: false` with **no** `--use-gl` args so Chrome uses
    the **real GPU**. The swiftshader args below force software WebGL and render the map as a **grey
    canvas** in a visible window — fine for headless screenshots, useless for a human to watch.
  - **Headless (CI/unattended):** `args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"]`
    so MapLibre still rasterizes offscreen.
  - Gate it: `const HEADLESS = process.env.HEADLESS === "1";` → `headless: HEADLESS`, `args: HEADLESS ? [swiftshader…] : []`.

## Caveat: ended trips auto-open the finale

If the trip is **ended**, the app auto-opens the "Trip Complete" credits finale on load, and the
**Replay** pill then runs the *finale* replay (`finaleReplayActive=true`, different
anchor/occluders) — not the normal replay. To test **normal** replay, close the finale first:
click **"Close to map archive"**, then click **Replay**. To test the **finale** path, just let
the credits play. Detect mode via `[data-finale-banner]` presence.

## The two patterns

### 1. Screenshot series (composition over time)

Log in, trigger the flow, then screenshot on a fixed cadence to catch transitions/dwells/end
states. ~900ms cadence catches checkpoint dwells; tighten to ~150–250ms to inspect a single
transition. Save to a gitignored scratch dir (e.g. `.visual-tmp/shots/`).

### 2. DOM geometry probe (numeric assertions)

```js
const measure = (page) => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
  return { header: r("header"), card: r("[data-replay-poi] button"),
           pin: r(".replay-focus-marker"), hud: r("[data-replay-hud]"),
           banner: r("[data-finale-banner]"), vh: innerHeight };
});
// then assert e.g. card.bottom < pin.top (card above pin),
// pin.bottom < hud.top (pin clear of controls), card.top > header.bottom.
```

To catch a specific beat (e.g. a checkpoint card), poll until the element exists rather than
sleeping a fixed time:

```js
const waitFor = async (page, sel, ms = 12000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.locator(sel).count()) return true; await page.waitForTimeout(150); }
  return false;
};
```

### 3. Map-layer application probe (did the layer actually update?)

Screenshots can't always tell whether a MapLibre vector layer (trail line, etc.) reflects the
current React state — the canvas may show **stale** data. When debugging "the map doesn't update,"
temporarily expose what the layer-sync code actually did via a `window.__*` hook, then read it with
`page.evaluate`:

```js
// in the source, temporarily: (window).__tripPathSync = { result: "setData"|"addLayer"|"removed"|..., feats };
const sync = await page.evaluate(() => window.__tripPathSync ?? null);
// "setData"/"addLayer" with the expected feature count = applied; "deferred"/"skip" = dropped.
```

This pinned the replay-exit trail bug in one run: post-exit the layer reported `deferred:once-load`
(update dropped) even though React had recomputed the full trail. Lesson: **MapLibre's
`map.isStyleLoaded()` is unreliable** (can read `false` on a perfectly updatable map), and
`map.once("load", …)` only fires once — don't gate source `setData` on either. Remove the `__*` hook
when done.

## Durable hooks already in place

`data-replay-hud`, `data-replay-poi`, `data-finale-banner`, `data-finale-header`, and
`data-replay-toggle` (the top-right Replay on/off pill) are stable selectors — prefer them over
Tailwind-class matching.

## Boot/login snippet (Traveler)

```js
import { chromium } from "playwright";
const BASE = process.env.TC_URL ?? "http://localhost:5173/tripcast-web/";
const CODE = process.env.TC_CODE ?? "<traveler-code>";
const browser = await chromium.launch({ headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Sign in as Traveler" }).click({ timeout: 30000 });
await page.getByPlaceholder("Enter code").fill(CODE);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "Replay" }).waitFor({ state: "visible", timeout: 45000 });
```

## Reading screenshots

In headless mode the map raster tiles may be blank for the first frame or two but DOM markers
and overlays render immediately, which is enough for layout/position/transition checks. Use the
`Read` tool on the saved PNGs to inspect them.

## Hygiene

- Keep ad-hoc driver scripts in a gitignored scratch dir (`.visual-tmp/`) and delete them when
  done, or promote a clean reusable one to `scripts/visual/` if the human wants it kept.
- Capture console errors during runs: `page.on("console", m => /error/i.test(m.text()) && console.log(m.text()))`.
- Storybook (`npm run storybook`) is the right place to verify a presentational component's
  states (e.g. photo vs text-only) without app state; reserve Playwright for behavior that only
  reproduces in the live app (map projection, camera centering, overlay lifecycle).
