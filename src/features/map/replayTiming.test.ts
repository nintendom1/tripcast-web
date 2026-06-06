import { describe, it, expect } from "vitest";
import { replayBeatMs, replayPinStep, advanceReplayIndex } from "./TripMap";

describe("replayBeatMs", () => {
  it("scales breadcrumb beats with speed down to a 60ms floor", () => {
    expect(replayBeatMs("breadcrumb", 1)).toBe(200);
    expect(replayBeatMs("breadcrumb", 2)).toBe(100);
    expect(replayBeatMs("breadcrumb", 5)).toBe(60); // floored
    expect(replayBeatMs("breadcrumb", 30)).toBe(60); // floored
  });

  it("keeps the checkpoint dwell above the 700ms floor so the card can play", () => {
    expect(replayBeatMs("checkpoint", 1)).toBe(3000);
    expect(replayBeatMs("checkpoint", 2)).toBe(1500);
    expect(replayBeatMs("checkpoint", 5)).toBe(700); // floored
    expect(replayBeatMs("checkpoint", 30)).toBe(700); // floored
  });
});

describe("replayPinStep", () => {
  it("is 1 up to the ~3.3x beat floor, then grows so higher speeds cover more ground", () => {
    expect(replayPinStep(1)).toBe(1);
    expect(replayPinStep(2)).toBe(1);
    expect(replayPinStep(3)).toBe(1);
    expect(replayPinStep(5)).toBe(2);
    expect(replayPinStep(10)).toBe(3);
    expect(replayPinStep(30)).toBe(9);
  });
});

describe("advanceReplayIndex", () => {
  const bc = { kind: "breadcrumb" as const };
  const cp = { kind: "checkpoint" as const };

  it("advances by one when step is 1", () => {
    const pins = [bc, bc, bc, bc];
    expect(advanceReplayIndex(0, pins, pins.length, 1)).toBe(1);
  });

  it("skips multiple breadcrumbs per beat at a higher step", () => {
    const pins = [bc, bc, bc, bc, bc, bc, bc, bc, bc, bc];
    expect(advanceReplayIndex(0, pins, pins.length, 4)).toBe(4);
  });

  it("never skips past a checkpoint (story) in range", () => {
    const pins = [bc, bc, cp, bc, bc]; // checkpoint at index 2
    expect(advanceReplayIndex(0, pins, pins.length, 9)).toBe(2);
  });

  it("caps at endIndex (the synthetic end beat)", () => {
    const pins = [bc, bc, bc];
    expect(advanceReplayIndex(0, pins, pins.length, 9)).toBe(3);
    expect(advanceReplayIndex(2, pins, pins.length, 9)).toBe(3);
  });
});
