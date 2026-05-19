import { describe, expect, it } from "vitest";
import {
  getStomachLevelFromScore,
  getEnergyLevelFromScore,
  getStressLevelFromScore,
  formatRelativeTime,
  formatTimeOfDay,
  parseTimeOfDay,
  getStateEmoji,
  MOOD_VALUES,
  SCHEDULE_VALUES,
  ENERGY_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
} from "./travelerStateUtils";

describe("formatTimeOfDay", () => {
  it("formats midnight as 12:00 AM", () => {
    expect(formatTimeOfDay(0)).toBe("12:00 AM");
  });
  it("formats noon as 12:00 PM", () => {
    expect(formatTimeOfDay(12 * 60)).toBe("12:00 PM");
  });
  it("formats 11:00 PM correctly", () => {
    expect(formatTimeOfDay(23 * 60)).toBe("11:00 PM");
  });
  it("formats 9:00 AM correctly", () => {
    expect(formatTimeOfDay(9 * 60)).toBe("9:00 AM");
  });
});

describe("parseTimeOfDay", () => {
  it("parses HH:MM into minutes", () => {
    expect(parseTimeOfDay("23:00")).toBe(23 * 60);
    expect(parseTimeOfDay("09:00")).toBe(9 * 60);
    expect(parseTimeOfDay("00:00")).toBe(0);
  });
  it("returns null on bad input", () => {
    expect(parseTimeOfDay("abc")).toBeNull();
    expect(parseTimeOfDay("25:00")).toBeNull();
    expect(parseTimeOfDay("12:60")).toBeNull();
  });
});

describe("getStomachLevelFromScore", () => {
  it.each([
    [0, "starving"],
    [12, "starving"],
    [13, "famished"],
    [37, "famished"],
    [38, "hungry"],
    [65, "hungry"],
    [66, "satisfied"],
    [90, "satisfied"],
    [91, "full"],
    [100, "full"],
    [101, "stuffed"],
    [135, "stuffed"],
    [136, "overate"],
    [150, "overate"],
  ] as const)("score %i → %s", (score, expected) => {
    expect(getStomachLevelFromScore(score)).toBe(expected);
  });
});

describe("getEnergyLevelFromScore", () => {
  it.each([
    [0, "very_low"],
    [20, "very_low"],
    [21, "low"],
    [40, "low"],
    [41, "medium"],
    [60, "medium"],
    [61, "high"],
    [90, "high"],
    [91, "very_high"],
    [100, "very_high"],
  ] as const)("score %i → %s", (score, expected) => {
    expect(getEnergyLevelFromScore(score)).toBe(expected);
  });
});

describe("getStressLevelFromScore", () => {
  it.each([
    [0, "calm"],
    [25, "calm"],
    [26, "mild"],
    [50, "mild"],
    [51, "stressed"],
    [75, "stressed"],
    [76, "overwhelmed"],
    [100, "overwhelmed"],
  ] as const)("score %i → %s", (score, expected) => {
    expect(getStressLevelFromScore(score)).toBe(expected);
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for very recent timestamps", () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe("just now");
  });

  it("returns minutes for timestamps under an hour", () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe("5m ago");
  });

  it("returns hours for timestamps under a day", () => {
    expect(formatRelativeTime(Date.now() - 2 * 3_600_000)).toBe("2h ago");
  });

  it("returns days for older timestamps", () => {
    expect(formatRelativeTime(Date.now() - 3 * 86_400_000)).toBe("3d ago");
  });
});

describe("getStateEmoji", () => {
  it("returns default emoji for null state", () => {
    expect(getStateEmoji(null)).toBe("🧍");
  });

  it("prioritizes moodValue over energy fallback", () => {
    const emoji = getStateEmoji({ moodValue: "hopeful", energyLevel: "very_low" });
    expect(emoji).not.toBe("🧍");
    expect(emoji).not.toBe("😴");
  });

  it("uses sleepy emoji for very_low or low energy when no moodValue", () => {
    expect(getStateEmoji({ energyLevel: "very_low" })).toBe("😴");
    expect(getStateEmoji({ energyLevel: "low" })).toBe("😴");
  });

  it("uses stomach emoji fallback when no moodValue or energy override", () => {
    expect(getStateEmoji({ stomachLevel: "starving" })).toBe("😫");
    expect(getStateEmoji({ stomachLevel: "famished" })).toBe("😫");
    expect(getStateEmoji({ stomachLevel: "satisfied" })).toBe("😌");
  });

  it("returns default when no relevant fields are set", () => {
    expect(getStateEmoji({})).toBe("🧍");
  });
});

describe("MOOD_VALUES ordering (worst → best)", () => {
  it("starts with the worst mood", () => {
    expect(MOOD_VALUES[0]).toBe("why_did_i_bother");
  });

  it("ends with the best mood", () => {
    expect(MOOD_VALUES.at(-1)).toBe("hopeful");
  });
});

describe("SCHEDULE_VALUES ordering (worst → best)", () => {
  it("starts with the worst schedule pressure", () => {
    expect(SCHEDULE_VALUES[0]).toBe("behind");
  });

  it("ends with the best schedule pressure", () => {
    expect(SCHEDULE_VALUES.at(-1)).toBe("ahead");
  });
});

describe("score↔level round-trip consistency", () => {
  it("energy: representative score maps back to its own level", () => {
    for (const [level, score] of Object.entries(ENERGY_SCORE_FOR_LEVEL)) {
      expect(getEnergyLevelFromScore(score)).toBe(level);
    }
  });

  it("stress: representative score maps back to its own level", () => {
    for (const [level, score] of Object.entries(STRESS_SCORE_FOR_LEVEL)) {
      expect(getStressLevelFromScore(score)).toBe(level);
    }
  });

  it("stomach: representative score maps back to its own level", () => {
    for (const [level, score] of Object.entries(STOMACH_SCORE_FOR_LEVEL)) {
      expect(getStomachLevelFromScore(score)).toBe(level);
    }
  });
});
