import type { MusicEditorPatch } from "../patchTypes";
import song1 from "./song1.json";
import song2 from "./song2.json";
import song3Night from "./song3_night.json";

export const PATCHES = {
  song1: song1 as unknown as MusicEditorPatch,
  song2: song2 as unknown as MusicEditorPatch,
  song3_night: song3Night as unknown as MusicEditorPatch,
} as const;

export type PatchSoundtrackId = keyof typeof PATCHES;

export function isPatchSoundtrack(value: string): value is PatchSoundtrackId {
  return Object.prototype.hasOwnProperty.call(PATCHES, value);
}
