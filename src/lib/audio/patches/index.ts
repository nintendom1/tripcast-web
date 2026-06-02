import type { MusicEditorPatch } from "../patchTypes";
import song4Day from "./song4_day.json";
import song4Night from "./song4_night.json";
import song6Vote from "./song6_vote.json";
import song7Story from "./song7_story.json";
import song8Trophy from "./song8_trophy.json";
import song9Intro from "./song9_intro.json";
import song10Credits from "./song10_credits.json";

export const PATCHES = {
  song4_day: song4Day as unknown as MusicEditorPatch,
  song4_night: song4Night as unknown as MusicEditorPatch,
  song6_vote: song6Vote as unknown as MusicEditorPatch,
  song7_story: song7Story as unknown as MusicEditorPatch,
  song8_trophy: song8Trophy as unknown as MusicEditorPatch,
  song9_intro: song9Intro as unknown as MusicEditorPatch,
  song10_credits: song10Credits as unknown as MusicEditorPatch,
} as const;

export type PatchSoundtrackId = keyof typeof PATCHES;

export function isPatchSoundtrack(value: string): value is PatchSoundtrackId {
  return Object.prototype.hasOwnProperty.call(PATCHES, value);
}
