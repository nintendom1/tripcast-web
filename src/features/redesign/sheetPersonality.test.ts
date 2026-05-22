import { describe, expect, it } from "vitest";

import {
  MEADOW_SHEET_PERSONALITIES,
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

  // The Meadow pass corrected an earlier mis-mapping (missions had forest,
  // journal had gold, awards had gold). Lock the intended identity colors so
  // the swap cannot silently regress.
  it.each([
    ["missions", "#ffb84a", "Tasks", "trophy"],
    ["journal", "#6dba4a", "Diary", "clock"],
    ["votes", "#7a9cdc", "Vote", "check-square"],
    ["awards", "#f06f7e", "Cabinet", "medal"],
    ["funds", "#6dba4a", "Ledger", "dollar-sign"],
  ] as const)("maps %s to its identity color/tag/motif", (key, color, tag, motif) => {
    const personality = MEADOW_SHEET_PERSONALITIES[key];
    expect(personality.color).toBe(color);
    expect(personality.tag).toBe(tag);
    expect(personality.motif).toBe(motif);
  });

  it("gives every sheet a hex accent color and a tinted background", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const key of SHEET_KEYS) {
      const p = MEADOW_SHEET_PERSONALITIES[key];
      expect(p.color, `${key} color`).toMatch(hex);
      expect(p.bg, `${key} bg`).toMatch(hex);
      expect(p.tag.length, `${key} tag`).toBeGreaterThan(0);
      expect(p.motif.length, `${key} motif`).toBeGreaterThan(0);
    }
  });
});
