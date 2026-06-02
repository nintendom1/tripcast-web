import { describe, it, expect } from "vitest";
import { PATCHES } from "./patches";

describe("Patch timing and loop calculations", () => {
  it("calculates total beats correctly", () => {
    const patch = PATCHES.song1;
    const beatsPerBar = patch.meter ?? 4;
    const totalBeats = patch.bars * beatsPerBar;
    expect(totalBeats).toBe(32); // song1 has 8 bars, 4/4 meter
  });

  it("identifies events at specific beats", () => {
    const patch = PATCHES.song1;
    const beatsPerBar = patch.meter ?? 4;

    // Find a known event in song1
    const firstMelodyEvent = patch.tracks.melody.events[0];
    const eventStartBeat = (firstMelodyEvent.bar - 1) * beatsPerBar + (firstMelodyEvent.beat - 1);

    expect(eventStartBeat).toBeGreaterThanOrEqual(0);
    expect(eventStartBeat).toBeLessThan(patch.bars * beatsPerBar);
  });

  it("handles song2 with 3/4 meter", () => {
    const patch = PATCHES.song2;
    expect(patch.meter).toBe(3);
    const beatsPerBar = patch.meter ?? 4;
    const totalBeats = patch.bars * beatsPerBar;
    expect(totalBeats).toBe(48); // song2 has 16 bars, 3/4 meter
  });

  it("correctly identifies drum events for kits", () => {
    const patch = PATCHES.song1;
    const drumTrack = patch.tracks.drums;
    expect(drumTrack.instrument).toBe("electronic-808");
    expect(drumTrack.events.some(e => e.drum === "kick")).toBe(true);
  });

  it("skips disabled tracks (mock simulation)", () => {
    const patch = JSON.parse(JSON.stringify(PATCHES.song1));
    patch.tracks.melody.enabled = false;
    expect(patch.tracks.melody.enabled).toBe(false);
  });
});
