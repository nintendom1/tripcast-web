import { describe, expect, it } from "vitest";

import {
  MEADOW_SHEET_PERSONALITIES,
  CONSTELLATION_SHEET_PERSONALITIES,
  SHEET_KEYS,
  type SheetKey,
} from "./sheetPersonality";

describe("MEADOW_SHEET_PERSONALITIES", () => {
  it("defines every sheet key exactly once", () => {
    const expected: SheetKey[] = [
      "journal",
      "missions",
      "votes",
      "awards",
      "state",
      "funds",
    ];
    expect([...SHEET_KEYS].sort()).toEqual([...expected].sort());
  });

  // Lock the tripcast-handoff-repair Meadow colors so the sheet identities
  // cannot silently regress.
  it.each([
    ["journal", "#ff8b4a", "#fff0dc", "clock"],
    ["missions", "#6dba4a", "#e5f2d6", "trophy"],
    ["votes", "#7a9cdc", "#dfeafa", "check-square"],
    ["awards", "#ffb84a", "#fff1d4", "medal"],
    ["funds", "#6dba4a", "#e5f2d6", "dollar-sign"],
  ] as const)("maps %s to its identity color/background/motif", (key, color, bg, motif) => {
    const personality = MEADOW_SHEET_PERSONALITIES[key];
    expect(personality.color).toBe(color);
    expect(personality.bg).toBe(bg);
    expect(personality.motif).toBe(motif);
  });

  it("gives every sheet a hex accent color and a tinted background", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const key of SHEET_KEYS) {
      const p = MEADOW_SHEET_PERSONALITIES[key];
      expect(p.color, `${key} color`).toMatch(hex);
      expect(p.bg, `${key} bg`).toMatch(hex);
      expect(p.motif.length, `${key} motif`).toBeGreaterThan(0);
    }
  });
});

describe("CONSTELLATION_SHEET_PERSONALITIES", () => {
  it("defines the same set of keys as Meadow", () => {
    expect(Object.keys(CONSTELLATION_SHEET_PERSONALITIES).sort()).toEqual(
      [...SHEET_KEYS].sort(),
    );
  });

  // Lock the Constellation design tokens from the handoff.
  it.each([
    ["journal",  "#7a9aff", "rgba(122,154,255,0.14)", "clock"],
    ["missions", "#ffb24a", "rgba(255,178,74,0.14)",  "trophy"],
    ["votes",    "#7ac88a", "rgba(122,200,138,0.14)", "check-square"],
    ["awards",   "#ffd86a", "rgba(255,216,106,0.14)", "medal"],
    ["state",    "#ff8aae", "rgba(255,138,174,0.14)", "heart"],
    ["funds",    "#ffb24a", "rgba(255,178,74,0.14)",  "dollar-sign"],
  ] as const)("maps %s to its Constellation color/background/motif", (key, color, bg, motif) => {
    const personality = CONSTELLATION_SHEET_PERSONALITIES[key];
    expect(personality.color).toBe(color);
    expect(personality.bg).toBe(bg);
    expect(personality.motif).toBe(motif);
  });

  it("gives every sheet a non-empty motif", () => {
    for (const key of SHEET_KEYS) {
      const p = CONSTELLATION_SHEET_PERSONALITIES[key];
      expect(p.motif.length, `${key} motif`).toBeGreaterThan(0);
    }
  });
});
