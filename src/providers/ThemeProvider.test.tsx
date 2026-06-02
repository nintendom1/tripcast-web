import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider, resolveAutoTheme, useTheme } from "./ThemeProvider";

function ThemeProbe() {
  const { mode, resolvedTheme, resolvedMapBase, setMode } = useTheme();
  return (
    <div>
      <p>mode: {mode}</p>
      <p>resolved: {resolvedTheme}</p>
      <p>map: {resolvedMapBase}</p>
      <button type="button" onClick={() => setMode("constellation")}>
        Constellation
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark", "theme-dark", "theme-transitioning");
  document.documentElement.removeAttribute("style");
});

describe("ThemeProvider", () => {
  it("applies Constellation variables and dark classes when selected", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Constellation" }));

    await waitFor(() => {
      expect(screen.getByText("mode: constellation")).toBeInTheDocument();
      expect(screen.getByText("resolved: constellation")).toBeInTheDocument();
      expect(screen.getByText("map: fiord")).toBeInTheDocument();
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement).toHaveClass("theme-dark");
      expect(document.documentElement).toHaveClass("theme-transitioning");
      expect(document.documentElement.style.getPropertyValue("--bg-paper")).toBe("#1c1f3a");
      expect(document.documentElement.style.getPropertyValue("--ink-danger")).toBe("#ff8aae");
      expect(document.documentElement.style.getPropertyValue("--danger")).toBe("#ff8aae");
    });
  });
});

describe("resolveAutoTheme", () => {
  // Fixed reference time chosen so the wall-clock minute in a known tz is
  // unambiguous regardless of when the test runs.
  // 2026-06-01 15:00:00 UTC = 00:00 the next day in Asia/Tokyo (UTC+9 in summer).
  const REFERENCE_NOW = Date.UTC(2026, 5, 1, 15, 0, 0); // June=5

  it("uses the traveler theme window over autoState bedtime/wake when set (step 1)", () => {
    // In Tokyo, REFERENCE_NOW is midnight.
    // autoState window (23:00 bed, 09:00 wake) would call this NIGHT.
    // Theme window (06:00 day, 22:00 night) wraps midnight as well — also night.
    // To disambiguate, use a theme window that excludes midnight: day=22:00, night=23:30.
    // 00:00 sits AFTER night=23:30 (wrapping past midnight) — still night → constellation.
    // Flip to: day=02:00, night=23:30 → 00:00 is in [23:30, 02:00) → night.
    // Then prove autoState's narrower window is ignored by using day=06:00, night=09:00
    // (which would put 00:00 in daytime per autoState).
    const result = resolveAutoTheme(
      {
        autoStateEnabled: true,
        autoTimeZone: "Asia/Tokyo",
        autoBedtimeMinutes: 6 * 60, // would call 00:00 = daytime
        autoWakeTimeMinutes: 9 * 60,
        preferencesTimeZone: "Asia/Tokyo",
        themeDayStartMinutes: 2 * 60, // 02:00
        themeNightStartMinutes: 23 * 60 + 30, // 23:30
      },
      null,
      REFERENCE_NOW,
    );
    expect(result.theme).toBe("constellation");
    expect(result.source).toBe("live-traveler");
    expect(result.reason).toMatch(/window=theme/);
    expect(result.timeZone).toBe("Asia/Tokyo");
  });

  it("falls back to autoState bedtime/wake when theme window is unset (step 1)", () => {
    const result = resolveAutoTheme(
      {
        autoStateEnabled: true,
        autoTimeZone: "Asia/Tokyo",
        autoBedtimeMinutes: 22 * 60,
        autoWakeTimeMinutes: 7 * 60,
        preferencesTimeZone: "Asia/Tokyo",
        themeDayStartMinutes: null,
        themeNightStartMinutes: null,
      },
      null,
      REFERENCE_NOW, // 00:00 in Tokyo — inside [22:00, 07:00) night window.
    );
    expect(result.theme).toBe("constellation");
    expect(result.source).toBe("live-traveler");
    expect(result.reason).toMatch(/window=autostate/);
  });

  it("uses the prefs tz + theme window when autoState is disabled (step 1.5)", () => {
    const result = resolveAutoTheme(
      {
        autoStateEnabled: false,
        preferencesTimeZone: "Asia/Tokyo",
        themeDayStartMinutes: 6 * 60,
        themeNightStartMinutes: 21 * 60,
      },
      null,
      REFERENCE_NOW, // 00:00 Tokyo — inside [21:00, 06:00) night
    );
    expect(result.theme).toBe("constellation");
    expect(result.source).toBe("preferences-traveler");
    expect(result.timeZone).toBe("Asia/Tokyo");
  });

  it("uses the cached tz with fallback window when snapshot is still loading (step 2)", () => {
    const result = resolveAutoTheme(undefined, "Asia/Tokyo", REFERENCE_NOW);
    expect(result.source).toBe("cached-traveler");
    expect(result.timeZone).toBe("Asia/Tokyo");
    // Tokyo 00:00 with fallback [21:00, 06:00) → night.
    expect(result.theme).toBe("constellation");
  });

  it("falls through to device clock when snapshot is loaded but disabled with no prefs tz (step 3)", () => {
    const result = resolveAutoTheme(
      {
        autoStateEnabled: false,
        preferencesTimeZone: null,
        themeDayStartMinutes: null,
        themeNightStartMinutes: null,
      },
      null,
      REFERENCE_NOW,
    );
    expect(result.source).toBe("device-clock");
    expect(result.reason).toBe("snapshot-disabled-no-prefs-tz");
  });
});
