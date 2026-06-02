export type MusicEditorInstrumentId =
  | "sine-wave"
  | "square-wave"
  | "saw-wave"
  | "tri-wave"
  | "warm-pad"
  | "bright-lead"
  | "sub-bass"
  | "electric-piano"
  | "acoustic-piano";

export type MusicEditorKitId =
  | "electronic-808"
  | "acoustic-studio"
  | "bit-crushed-lofi";

export type MusicEditorDrum = "kick" | "snare" | "hihat";

export interface MusicEditorEventBase {
  track?: string;
  bar: number;
  beat: number;
  durationBeats: number;
  velocity: number;
  label?: string;
}

export interface MusicEditorNoteEvent extends MusicEditorEventBase {
  midi: number;
}

export interface MusicEditorChordEvent extends MusicEditorEventBase {
  midis: number[];
}

export interface MusicEditorDrumEvent extends MusicEditorEventBase {
  drum: MusicEditorDrum;
}

export type MusicEditorEvent =
  | MusicEditorNoteEvent
  | MusicEditorChordEvent
  | MusicEditorDrumEvent;

export interface MusicEditorTrack {
  enabled: boolean;
  volume: number;
  instrument: string;
  events: MusicEditorEvent[];
}

export interface MusicEditorPatch {
  version?: number;
  name?: string;
  bpm: number;
  bars: number;
  meter?: number;
  tracks: Partial<Record<string, MusicEditorTrack>>;
}

export function isDrumEvent(event: MusicEditorEvent): event is MusicEditorDrumEvent {
  return "drum" in event && typeof (event as MusicEditorDrumEvent).drum === "string";
}

export function isChordEvent(event: MusicEditorEvent): event is MusicEditorChordEvent {
  return "midis" in event && Array.isArray((event as MusicEditorChordEvent).midis);
}

export function isNoteEvent(event: MusicEditorEvent): event is MusicEditorNoteEvent {
  return "midi" in event && typeof (event as MusicEditorNoteEvent).midi === "number";
}
