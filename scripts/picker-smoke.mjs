// Drives the crosshair location picker across its entry points and screenshots
// each state. Headed Chromium with mobile viewport. Requires a local Follower
// session file at tripcast-web/.playwright-session.json (gitignored) of the
// shape: {"token":"...","sessionType":"follower","username":"..."}.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const SESSION_PATH = join(REPO, ".playwright-session.json");
const OUT_DIR = join(HERE, "picker-smoke-screenshots");
const APP_URL = "http://localhost:5173/tripcast-web/";

if (!existsSync(SESSION_PATH)) {
  console.error(`Missing ${SESSION_PATH}`);
  process.exit(1);
}
const sessionRaw = readFileSync(SESSION_PATH, "utf8").trim();
mkdirSync(OUT_DIR, { recursive: true });

const consoleLines = [];
const interestingPattern = /(coordinate:|coordinate-pick|pick-mode|sheet:|map:camera|map:click)/;
const SHOT_LOG = [];

async function shot(page, name) {
  const file = join(OUT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
    SHOT_LOG.push(name);
    console.log(`[shot] ${name}`);
  } catch (e) {
    console.error(`[shot:fail] ${name}: ${e.message}`);
  }
}

async function dragMap(page, dx, dy) {
  const map = await page.locator(".maplibregl-canvas").first().boundingBox();
  if (!map) throw new Error("no map canvas");
  const sx = map.x + map.width / 2;
  const sy = map.y + map.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps, { steps: 2 });
  }
  await page.mouse.up();
}

async function readMapCenter(page) {
  return page.evaluate(() => {
    const txt = document.querySelector("[role='status']")?.textContent ?? "";
    const m = txt.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  });
}

async function closeOpenSheets(page) {
  // Press Escape a few times; non-modal map sheets respond to this.
  // Also click any visible close X buttons inside sheets.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
  const closeButtons = page.locator("[data-base-ui-portal] button[aria-label*='Close' i]");
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    const b = closeButtons.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(120);
    }
  }
}

async function openMissions(page) {
  await closeOpenSheets(page);
  const tab = page.locator("nav[aria-label='Map sections'] button[aria-label='Missions']");
  await tab.click();
  await page.waitForTimeout(500);
}

async function safeClick(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click().catch((e) => consoleLines.push(`[click:fail] ${e.message}`));
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    if (interestingPattern.test(text)) consoleLines.push(`[${msg.type()}] ${text}`);
  });
  page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((raw) => {
    localStorage.setItem("tripcast.session", raw);
    // Enable in-app debug logger so console emits the events we want.
    localStorage.setItem("tripcast.debug.enabled", "true");
  }, sessionRaw);
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.locator(".maplibregl-canvas").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);

  try {
    await shot(page, "00-initial");

    // ── A) Propose mission flow ────────────────────────────────────────────────
    await openMissions(page);
    await shot(page, "01-missions-panel");

    const propose = page.getByRole("button", { name: /Propose (a )?[Mm]ission|Suggest/ }).first();
    if (await propose.isVisible().catch(() => false)) {
      await propose.click();
      await page.waitForTimeout(500);
      await shot(page, "02-propose-form");

      const title = page.locator("input").first();
      await title.fill("Smoke test — picker check");

      // Pick on map → drag → tap-to-center → Use this location
      await safeClick(page.getByRole("button", { name: /Pick location on map/i }).first());
      await page.waitForTimeout(500);
      await shot(page, "03-picker-open-no-initial");
      const c0 = await readMapCenter(page);
      consoleLines.push(`[centers] proposal:opened center=${JSON.stringify(c0)}`);

      await dragMap(page, -120, -80);
      await page.waitForTimeout(400);
      await shot(page, "04-after-drag");
      const c1 = await readMapCenter(page);
      consoleLines.push(`[centers] proposal:after-drag center=${JSON.stringify(c1)}`);

      const map = await page.locator(".maplibregl-canvas").first().boundingBox();
      await page.mouse.click(map.x + 60, map.y + 160);
      await page.waitForTimeout(700);
      await shot(page, "05-after-tap-to-center");

      await safeClick(page.getByRole("button", { name: /Use this location/i }).first());
      await page.waitForTimeout(1100);
      await shot(page, "06-after-use-this-location");

      // Verify preview pin marker is in the DOM right after confirm.
      const previewBefore = await page.evaluate(
        () => document.querySelectorAll(".preview-pin-marker").length,
      );
      consoleLines.push(`[preview-pin] after-use-this-location count=${previewBefore} (expect 1)`);

      // ── B') Submit the form (Save) — preview pin should disappear ─────────
      const saveBtn = page
        .getByRole("button", { name: /^(Propose mission|Add mission|Save|Submit)$/i })
        .first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1800);
        await shot(page, "06b-after-save");
        const previewAfter = await page.evaluate(
          () => document.querySelectorAll(".preview-pin-marker").length,
        );
        consoleLines.push(`[preview-pin] after-save count=${previewAfter} (expect 0)`);
      } else {
        consoleLines.push("[note] Save button not found — skipped save check");
      }
      // Reopen the form so the later Change/Cancel/Dock-interrupt flow still runs.
      const proposeAgain = page
        .getByRole("button", { name: /Propose (a )?[Mm]ission|Suggest/ })
        .first();
      if (await proposeAgain.isVisible().catch(() => false)) {
        await proposeAgain.click();
        await page.waitForTimeout(400);
        const title2 = page.locator("input").first();
        await title2.fill("Round 2");
        await safeClick(page.getByRole("button", { name: /Pick location on map/i }).first());
        await page.waitForTimeout(500);
        await safeClick(page.getByRole("button", { name: /Use this location/i }).first());
        await page.waitForTimeout(900);
      }

      // ── B) Change reopens picker — with initialCoord this time ────────────
      const changeBtn = page.getByRole("button", { name: /^Change$/ }).first();
      if (await changeBtn.isVisible().catch(() => false)) {
        await changeBtn.click();
        await page.waitForTimeout(700);
        await shot(page, "07-change-reopens-picker-INITIAL");
        const c2 = await readMapCenter(page);
        consoleLines.push(`[centers] proposal:change-reopened center=${JSON.stringify(c2)} (should match c1)`);

        // Cancel returns sheet untouched
        await safeClick(page.getByRole("button", { name: /^Cancel$/ }).first());
        await page.waitForTimeout(400);
        await shot(page, "08-after-cancel");
      }

      // ── C) Dock interrupt cancels picker ─────────────────────────────────
      const changeAgain = page.getByRole("button", { name: /^Change$/ }).first();
      if (await changeAgain.isVisible().catch(() => false)) {
        await changeAgain.click();
        await page.waitForTimeout(500);
        await shot(page, "09-picker-open-again");
        await safeClick(
          page.locator("nav[aria-label='Map sections'] button[aria-label='Journal']"),
        );
        await page.waitForTimeout(700);
        await shot(page, "10-dock-interrupt-to-journal");
      }
    } else {
      consoleLines.push("[note] propose mission entry not found");
    }

    // ── D) Edit-existing-pin: open a mission with a coord, Edit, Change ──────
    await openMissions(page);
    await shot(page, "11-missions-list");
    // Click the first mission card in the list
    const firstMissionCard = page
      .locator("[data-role='missions-sheet'] button:has-text('UNLOCKED'), [data-role='missions-sheet'] button:has(.text-xs):not([aria-label])")
      .first()
      .or(page.locator("[data-role='missions-sheet'] li").first());
    if (await firstMissionCard.isVisible().catch(() => false)) {
      await firstMissionCard.click();
      await page.waitForTimeout(500);
      await shot(page, "12-mission-detail");

      const edit = page.getByRole("button", { name: /^Edit$/i }).first();
      if (await edit.isVisible().catch(() => false)) {
        await edit.click();
        await page.waitForTimeout(500);
        await shot(page, "13-mission-edit");

        const chipText = await page
          .locator("[data-role='missions-sheet']")
          .locator("text=/[-+]?\\d+\\.\\d{4,5},\\s*[-+]?\\d+\\.\\d{4,5}/")
          .first()
          .textContent()
          .catch(() => null);
        consoleLines.push(`[edit] chip-coord-before-change=${chipText ?? "n/a"}`);

        const changeCoord = page.getByRole("button", { name: /^Change$/ }).first();
        if (await changeCoord.isVisible().catch(() => false)) {
          await changeCoord.click();
          await page.waitForTimeout(900);
          await shot(page, "14-edit-picker-initial-center");
          const cEdit = await readMapCenter(page);
          consoleLines.push(`[centers] edit:opened center=${JSON.stringify(cEdit)} (should ≈ chip-coord)`);

          await safeClick(page.getByRole("button", { name: /^Cancel$/ }).first());
          await page.waitForTimeout(400);
          await shot(page, "15-edit-cancel");
        } else {
          consoleLines.push("[edit] Change button not found");
        }
      } else {
        consoleLines.push("[edit] Edit button not found on detail");
      }
    } else {
      consoleLines.push("[edit] no mission card in list");
    }
  } catch (err) {
    consoleLines.push(`[fatal] ${err.message}`);
    await shot(page, "ZZ-failure-state");
  } finally {
    const logPath = join(OUT_DIR, "console.log");
    writeFileSync(
      logPath,
      `# Shots taken: ${SHOT_LOG.length}\n` +
        SHOT_LOG.map((s) => `  ${s}`).join("\n") +
        "\n\n# Captured events:\n" +
        consoleLines.join("\n") +
        "\n",
      "utf8",
    );
    console.log(`\n[done] wrote ${consoleLines.length} events -> ${logPath}`);
    await page.waitForTimeout(400);
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
