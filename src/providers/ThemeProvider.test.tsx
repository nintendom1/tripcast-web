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

  it("uses the manual theme window over system defaults (step 1)", () => {
    // In Tokyo, REFERENCE_NOW is midnight.
    // System default window (21:00 night, 06:00 day) would call this NIGHT.
    // To prove override: use a manual window that calls 00:00 DAYTIME (Meadow).
    // We set day=23:00, night=02:00 -> 00:00 is Day.
    const result = resolveAutoTheme(
      {
        autoStateEnabled: true,
        autoTimeZone: "Asia/Tokyo",
        autoBedtimeMinutes: 22 * 60,
        autoWakeTimeMinutes: 7 * 60,
        preferencesTimeZone: "Asia/Tokyo",
        themeDayStartMinutes: 23 * 60, // 11 PM
        themeNightStartMinutes: 2 * 60, // 2 AM
      },
      null,
      REFERENCE_NOW,
    );
    expect(result.theme).toBe("meadow");
    expect(result.source).toBe("live-traveler");
    expect(result.reason).toBe("snapshot-enabled:window=theme");
    expect(result.timeZone).toBe("Asia/Tokyo");
  });

  it("ignores autoState bedtime/wake and uses system defaults when theme window is unset (step 1)", () => {
    // 14:45 UTC is 07:45 AM PDT (UTC-7).
    // Default day start is 06:00 AM.
    // Even if auto wake is 09:00 AM, it should be MEADOW at 07:45 AM.
    const TIME_745_LA = Date.UTC(2026, 5, 1, 14, 45, 0);

    const result = resolveAutoTheme(
      {
        autoStateEnabled: true,
        autoTimeZone: "America/Los_Angeles",
        autoBedtimeMinutes: 23 * 60, // 11 PM
        autoWakeTimeMinutes: 9 * 60,  // 9 AM
        preferencesTimeZone: "America/Los_Angeles",
        themeDayStartMinutes: null,
        themeNightStartMinutes: null,
      },
      null,
      TIME_745_LA,
    );
    expect(result.theme).toBe("meadow");
    expect(result.source).toBe("live-traveler");
    expect(result.reason).toBe("snapshot-enabled:window=fallback");
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

  it("prefers the device tz over the cached tz when snapshot is still loading (step 2)", () => {
    // Device says Tokyo (00:00 → night), cache says UTC (15:00 → day). Device wins.
    const result = resolveAutoTheme(undefined, "UTC", REFERENCE_NOW, "Asia/Tokyo");
    expect(result.source).toBe("device-loading");
    expect(result.timeZone).toBe("Asia/Tokyo");
    expect(result.theme).toBe("constellation");
  });

  it("falls back to cached tz when device tz is unavailable during loading (step 2)", () => {
    const result = resolveAutoTheme(undefined, "Asia/Tokyo", REFERENCE_NOW, null);
    expect(result.source).toBe("cached-traveler");
    expect(result.timeZone).toBe("Asia/Tokyo");
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
