import { describe, it, expect } from "vitest";
import { computeNextReactions } from "./ReactionSection";

const entry = (emoji: string, count: number) => ({ emoji, count });

describe("computeNextReactions", () => {
  it("inserts a new reaction when the viewer has none", () => {
    const next = computeNextReactions({ entries: [entry("👍", 3)] }, "❤️");
    expect(next.entries.sort((a, b) => a.emoji.localeCompare(b.emoji))).toEqual([
      entry("❤️", 1),
      entry("👍", 3),
    ]);
    expect(next.myReaction).toBe("❤️");
  });

  it("removes the viewer's reaction when toggling the same emoji", () => {
    const next = computeNextReactions(
      { entries: [entry("❤️", 2), entry("👍", 1)], myReaction: "❤️" },
      "❤️",
    );
    expect(next.entries.sort((a, b) => a.emoji.localeCompare(b.emoji))).toEqual([
      entry("❤️", 1),
      entry("👍", 1),
    ]);
    expect(next.myReaction).toBeUndefined();
  });

  it("drops the emoji from entries when removing the only reaction", () => {
    const next = computeNextReactions(
      { entries: [entry("❤️", 1)], myReaction: "❤️" },
      "❤️",
    );
    expect(next.entries).toEqual([]);
    expect(next.myReaction).toBeUndefined();
  });

  it("swaps the viewer's reaction when toggling a different emoji", () => {
    const next = computeNextReactions(
      { entries: [entry("❤️", 2), entry("👍", 1)], myReaction: "❤️" },
      "👍",
    );
    expect(next.entries.sort((a, b) => a.emoji.localeCompare(b.emoji))).toEqual([
      entry("❤️", 1),
      entry("👍", 2),
    ]);
    expect(next.myReaction).toBe("👍");
  });

  it("drops the previous emoji from entries when its last reactor swaps", () => {
    const next = computeNextReactions(
      { entries: [entry("❤️", 1)], myReaction: "❤️" },
      "👍",
    );
    expect(next.entries).toEqual([entry("👍", 1)]);
    expect(next.myReaction).toBe("👍");
  });

  it("does not mutate the input", () => {
    const original: { entries: { emoji: string; count: number }[]; myReaction?: string } = {
      entries: [entry("❤️", 2)],
      myReaction: "❤️",
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    computeNextReactions(original, "👍");
    expect(original).toEqual(snapshot);
  });
});
