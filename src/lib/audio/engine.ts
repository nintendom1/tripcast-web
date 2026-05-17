/**
 * TripCast audio engine — stub implementation.
 *
 * Part 1 ships the surface so subsequent parts can wire `sfx()`, `setScenario()`,
 * etc. at the same time they wire their UI. Part 11 replaces this with a real
 * Web Audio API engine generating scenario-aware music + SFX (no MP3 files).
 *
 * Mirrors the API of tripcast-claude-design-handoff-temp/project/src/music.js.
 */

export type AudioScenario = "idle" | "voteActive" | "challengeActive" | "overBudget" | "story";

export type AudioSoundtrack =
  | "auto"
  | "idle"
  | "happy"
  | "morning"
  | "cafe"
  | "story"
  | "vote"
  | "challenge";

export type SfxName =
  | "pin"
  | "open"
  | "close"
  | "vote"
  | "success"
  | "tap"
  | "page"
  | "toast";

export interface AudioEngine {
  armOnGesture(): void;
  setMute(mute: boolean): void;
  setVolume(volume: number): void;
  setScenario(scenario: AudioScenario): void;
  setSoundtrack(soundtrack: AudioSoundtrack): void;
  sfx(name: SfxName): void;
}

export function createAudioEngine(): AudioEngine {
  // No-op stub. Real implementation lands in Part 11.
  return {
    armOnGesture() {},
    setMute(_mute: boolean) {},
    setVolume(_volume: number) {},
    setScenario(_scenario: AudioScenario) {},
    setSoundtrack(_soundtrack: AudioSoundtrack) {},
    sfx(_name: SfxName) {},
  };
}
