import {
  isChordEvent,
  isDrumEvent,
  isNoteEvent,
  type MusicEditorPatch,
  type MusicEditorEventBase,
} from "./patchTypes";

type InstrumentDef = {
  type: OscillatorType;
  attack: number;
  filter: number;
  decay: number;
  partials?: { type: OscillatorType; detune: number; gain: number }[];
};

export const INSTRUMENTS: Record<string, InstrumentDef> = {
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

type KitDef = {
  kick: number;
  snare: number;
  hihat: number;
  kickType: BiquadFilterType;
  snareType: BiquadFilterType;
};

export const KITS: Record<string, KitDef> = {
  "electronic-808": { kick: 150, snare: 5000, hihat: 8000, kickType: "lowpass", snareType: "highpass" },
  "acoustic-studio": { kick: 100, snare: 3000, hihat: 10000, kickType: "lowpass", snareType: "highpass" },
  "bit-crushed-lofi": { kick: 200, snare: 2000, hihat: 4000, kickType: "lowpass", snareType: "bandpass" },
};

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function computeBeatsPerBar(patch: MusicEditorPatch): number {
  return patch.meter ?? 4;
}

export function computeBeatDur(patch: MusicEditorPatch): number {
  return 60 / patch.bpm;
}

export function computeLoopSeconds(patch: MusicEditorPatch): number {
  return patch.bars * computeBeatsPerBar(patch) * computeBeatDur(patch);
}

export function computeEventOffsetSeconds(
  event: MusicEditorEventBase,
  beatsPerBar: number,
  beatDur: number,
): number {
  return ((event.bar - 1) * beatsPerBar + (event.beat - 1)) * beatDur;
}

export function playOsc(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  instrumentId: string,
): void {
  const inst = INSTRUMENTS[instrumentId] ?? INSTRUMENTS["sine-wave"];
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(inst.filter, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + inst.attack);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const partials = inst.partials ?? [{ type: inst.type, detune: 0, gain: 1 }];
  partials.forEach((partial) => {
    const osc = ctx.createOscillator();
    osc.type = partial.type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.detune.setValueAtTime(partial.detune ?? 0, startTime);

    if (partial.gain !== 1) {
      const partialGain = ctx.createGain();
      partialGain.gain.value = partial.gain;
      osc.connect(partialGain);
      partialGain.connect(filter);
    } else {
      osc.connect(filter);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });

  filter.connect(gain);
  gain.connect(destination);
}

export function playNoise(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  duration: number,
  volume: number,
  drumType: string,
  kitId: string,
): void {
  const kit = KITS[kitId] ?? KITS["electronic-808"];
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  source.buffer = buffer;

  if (drumType === "kick") {
    filter.type = kit.kickType;
    filter.frequency.setValueAtTime(kit.kick, startTime);
    filter.Q.setValueAtTime(10, startTime);
  } else if (drumType === "snare") {
    filter.type = kit.snareType;
    filter.frequency.setValueAtTime(kit.snare, startTime);
  } else {
    filter.type = "highpass";
    filter.frequency.setValueAtTime(kit.hihat, startTime);
  }

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

/**
 * Schedule every event in one loop of the patch, anchored at `loopStartTime`.
 * Pure helper — does no looping, no cursor management, no time-now checks.
 * Engine code calls this once per loop iteration; tests call it directly.
 */
export function scheduleOneLoop(
  ctx: AudioContext,
  destination: AudioNode,
  patch: MusicEditorPatch,
  loopStartTime: number,
): void {
  const beatDur = computeBeatDur(patch);
  const beatsPerBar = computeBeatsPerBar(patch);

  for (const track of Object.values(patch.tracks)) {
    if (!track || !track.enabled) continue;
    const trackVol = track.volume;
    const instrument = track.instrument;

    for (const event of track.events) {
      const start = loopStartTime + computeEventOffsetSeconds(event, beatsPerBar, beatDur);
      const dur = event.durationBeats * beatDur;
      const vol = event.velocity * trackVol;

      if (isDrumEvent(event)) {
        playNoise(ctx, destination, start, dur, vol, event.drum, instrument);
      } else if (isChordEvent(event)) {
        for (const midi of event.midis) {
          playOsc(ctx, destination, midiToFrequency(midi), start, dur, vol, instrument);
        }
      } else if (isNoteEvent(event)) {
        playOsc(ctx, destination, midiToFrequency(event.midi), start, dur, vol, instrument);
      }
    }
  }
}
