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
- **Scope text assertions too.** Same rule for text: query *within* a container
  (`page.locator("[data-role='…']").getByText(…)`) and wait on the most specific string — don't
  `.first()` a substring that sibling nodes share.
- **Add durable DOM hooks.** When you need to locate something repeatedly, add a stable
  `data-*` attribute in the source (e.g. `data-replay-poi`, `data-replay-hud`) rather than
  matching Tailwind classes. These double as test selectors later.
- **Don't loop blindly.** If two tuning passes don't converge, stop and ask the human. Don't
  retry the same failing action repeatedly.

## Prerequisites

- The dev server must be running: **`npm run dev` is agent-restricted** — ask the human to start
  it and confirm the URL. Default is `http://localhost:5173/tripcast-web/` (note the
  `/tripcast-web/` base from `vite.config.ts`). Probe before driving:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/tripcast-web/`. If the human says
  it's already running, just probe and proceed — don't ask again.
- Auth: sign in as **Traveler**. The default landing screen is a marketing page — the path is
  **"Sign in to TripCast"** (`.first()` — it appears in both header and footer) → **"Sign in as
  Traveler"** → fill **"Enter code"** → **"Sign in"**. The code lives in **`.local.auth.md` at the
  workspace root**, one level **above** `tripcast-web/`:
  - **macOS:** `/Users/<you>/repos/tripcast/.local.auth.md`
  - **Windows:** `c:\repos\tripcast\.local.auth.md`

  The file sits outside the `tripcast-web` git repo (toplevel is `tripcast-web/`), so git literally
  cannot stage it — no `.gitignore` entry needed. If it's missing, ask the human to create it. If
  the value reads like a placeholder, ask before using it. A saved Playwright session may exist at
  `tripcast-web/.playwright-session.json`, but it has been a **Follower** token — re-auth as
  Traveler for replay/trail flows.
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

## The four patterns

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

### 3. Camera-state probe (where did the map actually center?)

Screenshots can't reliably tell you the exact `LngLat` MapLibre is showing — tile rasterization is
async and the canvas may be blank for the first frame. For verifying camera moves (launch
centering, `jumpTo`/`easeTo` flows), temporarily expose the map instance from the source and read
its state directly:

```ts
// in TripMap.tsx map-init effect, immediately after setMapInstance(map):
(globalThis as { __map?: maplibregl.Map }).__map = map; // VISUAL-VERIFY: remove after run
```

```js
// in the Playwright driver:
await page.waitForFunction(() => !!globalThis.__map, null, { timeout: 15000 });
const cam = await page.evaluate(() => {
  const m = globalThis.__map;
  const c = m?.getCenter?.();
  return c ? { lng: c.lng, lat: c.lat, zoom: m.getZoom?.() } : null;
});
// then assert e.g. Math.abs(cam.lng - LISBON.lng) < 0.5 && Math.abs(cam.lat - LISBON.lat) < 0.5
```

For GPS-dependent flows, fake the device location via the browser context, not page-level:

```js
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 38.7223, longitude: -9.1393 }, // Lisbon
  permissions: ["geolocation"],
});
```

To verify the denied-permission fall-through, just **omit** both `geolocation` and `permissions`;
`getCurrentPosition` will call the error callback. **Remove the `__map` hook before committing**;
it's verification-only scaffolding.

### 4. Map-layer application probe (did the layer actually update?)

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

## Data-dependent flows (non-map)

Sheet/flow behavior that depends on live Convex data — preflight gates, over-limit errors, empty
vs full states — only reproduces in the running app (Storybook can't), so it's valid Playwright
territory. These runs need **no** `--use-gl` args; there's no map canvas to rasterize.

- **Seed the precondition, don't click to it.** Reach a data state (e.g. >8192 rows) with a
  dev-only `internalMutation` run via `npx convex run pkg:fn '{...}'`; batch large inserts
  (~1k/call) to stay under per-mutation write limits, and ship a paired `clear*` mutation.
- **Assert the crash fallback is absent.** It is `role="alert"` titled "TripCast hit a problem.";
  `expect(count).toBe(0)` is the pass condition for resilience flows.
- **Navigate by accessible name:** menus by `aria-label`, list rows by visible title; `data-*` for
  scoping containers.
- **Make the driver self-asserting** — non-zero exit on failure — so a run is verified, not eyeballed.

## Durable hooks already in place

`data-replay-hud`, `data-replay-poi`, `data-finale-banner`, `data-finale-header`, and
`data-replay-toggle` (the top-right Replay on/off pill) are stable selectors — prefer them over
Tailwind-class matching.

## Boot/login snippet (Traveler)

```js
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const BASE = process.env.TC_URL ?? "http://localhost:5173/tripcast-web/";
// macOS: ../.local.auth.md is the parent dir (workspace root).
const CODE = (process.env.TC_CODE ?? readFileSync("../.local.auth.md", "utf8")).trim();
const browser = await chromium.launch({ headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
// Landing → modal → traveler form.
await page.getByRole("button", { name: "Sign in to TripCast" }).first().click({ timeout: 30000 });
await page.getByRole("button", { name: "Sign in as Traveler" }).click({ timeout: 15000 });
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
- If you seeded backend (Convex) state, clear it before finishing (paired `clear*` mutation or
  Emergency Reset) and tell the human what you left behind.
- Capture console errors during runs: `page.on("console", m => /error/i.test(m.text()) && console.log(m.text()))`.
- Storybook (`npm run storybook`) is the right place to verify a presentational component's
  states (e.g. photo vs text-only) without app state; reserve Playwright for behavior that only
  reproduces in the live app (map projection, camera centering, overlay lifecycle).
