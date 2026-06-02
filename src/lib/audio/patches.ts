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

export type MusicEditorKitId = "electronic-808" | "acoustic-studio" | "bit-crushed-lofi";

export interface MusicEditorEvent {
  track: string;
  bar: number;
  beat: number;
  durationBeats: number;
  velocity: number;
  midi?: number;
  midis?: number[];
  drum?: "kick" | "snare" | "hihat";
  label: string;
}

export interface MusicEditorTrack {
  enabled: boolean;
  volume: number;
  instrument: MusicEditorInstrumentId | MusicEditorKitId;
  whyInstrument?: string;
  events: MusicEditorEvent[];
}

export interface MusicEditorPatch {
  version: number;
  name: string;
  bpm: number;
  key: string;
  mode: string;
  bars: number;
  meter?: number;
  progression: string[];
  tracks: {
    melody: MusicEditorTrack;
    countermelody: MusicEditorTrack;
    chords: MusicEditorTrack;
    bass: MusicEditorTrack;
    drums: MusicEditorTrack;
  };
}

export const INSTRUMENTS: Record<
  MusicEditorInstrumentId,
  {
    type: OscillatorType;
    attack: number;
    filter: number;
    decay: number;
    partials?: Array<{ type: OscillatorType; detune: number; gain: number }>;
  }
> = {
  "sine-wave": { type: "sine", attack: 0.02, filter: 2000, decay: 0.5 },
  "square-wave": { type: "square", attack: 0.01, filter: 1500, decay: 0.4 },
  "saw-wave": { type: "sawtooth", attack: 0.01, filter: 2500, decay: 0.4 },
  "tri-wave": { type: "triangle", attack: 0.02, filter: 1000, decay: 0.6 },
  "warm-pad": { type: "sine", attack: 0.4, filter: 800, decay: 1.2 },
  "bright-lead": { type: "sawtooth", attack: 0.01, filter: 3000, decay: 0.3 },
  "sub-bass": { type: "triangle", attack: 0.05, filter: 400, decay: 0.8 },
  "electric-piano": { type: "sine", attack: 0.01, filter: 1200, decay: 0.8 },
  "acoustic-piano": {
    type: "triangle",
    attack: 0.005,
    filter: 2400,
    decay: 1.1,
    partials: [
      { type: "triangle", detune: 0, gain: 1 },
      { type: "sine", detune: 1200, gain: 0.35 },
      { type: "sine", detune: 1900, gain: 0.18 },
    ],
  },
};

export const KITS: Record<
  MusicEditorKitId,
  {
    kick: number;
    snare: number;
    hihat: number;
    kickType: BiquadFilterType;
    snareType: BiquadFilterType;
  }
> = {
  "electronic-808": {
    kick: 150,
    snare: 5000,
    hihat: 8000,
    kickType: "lowpass",
    snareType: "highpass",
  },
  "acoustic-studio": {
    kick: 100,
    snare: 3000,
    hihat: 10000,
    kickType: "lowpass",
    snareType: "highpass",
  },
  "bit-crushed-lofi": {
    kick: 200,
    snare: 2000,
    hihat: 4000,
    kickType: "lowpass",
    snareType: "bandpass",
  },
};

import song1Json from "./song1_json.json";
import song2Json from "./song2_json.json";
import song3Json from "./song3_json.json";

export const SONG1_PATCH = song1Json as MusicEditorPatch;
export const SONG2_PATCH = song2Json as MusicEditorPatch;
export const SONG3_PATCH = song3Json as MusicEditorPatch;

export const PATCHES: Record<string, MusicEditorPatch> = {
  song1: SONG1_PATCH,
  song2: SONG2_PATCH,
  song3: SONG3_PATCH,
};
