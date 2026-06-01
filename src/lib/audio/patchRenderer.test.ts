import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeBeatDur,
  computeBeatsPerBar,
  computeEventOffsetSeconds,
  computeLoopSeconds,
  midiToFrequency,
  scheduleOneLoop,
} from "./patchRenderer";
import type { MusicEditorPatch } from "./patchTypes";

class FakeAudioParam {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
}

class FakeNode {
  connect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  start = vi.fn();
  stop = vi.fn();
}

interface FakeBuffer {
  channel: Float32Array;
  getChannelData(): Float32Array;
}

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  filters: FakeFilter[] = [];

  createGain() {
    return new FakeGain();
  }

  createBiquadFilter() {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }

  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }

  createBuffer(_channels: number, length: number, _rate: number) {
    const channel = new Float32Array(length);
    return {
      channel,
      getChannelData: () => channel,
    } as FakeBuffer;
  }

  createBufferSource() {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }
}

function makeCtx() {
  return new FakeAudioContext() as unknown as AudioContext;
}

function emptyPatch(overrides: Partial<MusicEditorPatch> = {}): MusicEditorPatch {
  return {
    bpm: 120,
    bars: 4,
    tracks: {},
    ...overrides,
  };
}

describe("patch math helpers", () => {
  it("computeBeatsPerBar defaults to 4 when meter is absent", () => {
    expect(computeBeatsPerBar(emptyPatch())).toBe(4);
    expect(computeBeatsPerBar(emptyPatch({ meter: 3 }))).toBe(3);
  });

  it("computeBeatDur returns 60 / bpm", () => {
    expect(computeBeatDur(emptyPatch({ bpm: 120 }))).toBeCloseTo(0.5);
    expect(computeBeatDur(emptyPatch({ bpm: 80 }))).toBeCloseTo(0.75);
  });

  it("computeEventOffsetSeconds: bar 1 beat 1 is zero", () => {
    expect(computeEventOffsetSeconds({ bar: 1, beat: 1, durationBeats: 1, velocity: 1 }, 4, 0.5)).toBe(0);
  });

  it("computeEventOffsetSeconds: bar 2 beat 1 at 120bpm 4/4 is 2.0s", () => {
    const beatDur = 60 / 120;
    expect(
      computeEventOffsetSeconds({ bar: 2, beat: 1, durationBeats: 1, velocity: 1 }, 4, beatDur),
    ).toBeCloseTo(2.0);
  });

  it("computeEventOffsetSeconds: bar 3 beat 2.5 with fractional beat", () => {
    const beatDur = 60 / 120;
    const expected = ((3 - 1) * 4 + (2.5 - 1)) * beatDur;
    expect(
      computeEventOffsetSeconds({ bar: 3, beat: 2.5, durationBeats: 1, velocity: 1 }, 4, beatDur),
    ).toBeCloseTo(expected);
  });

  it("computeEventOffsetSeconds honors non-default meter", () => {
    const beatDur = 60 / 120;
    // bar 2 beat 1 in 3/4 = 3 beats * 0.5 = 1.5s
    expect(
      computeEventOffsetSeconds({ bar: 2, beat: 1, durationBeats: 1, velocity: 1 }, 3, beatDur),
    ).toBeCloseTo(1.5);
  });

  it("computeLoopSeconds: 8 bars * 4 beats * (60/80) = 24s", () => {
    expect(computeLoopSeconds(emptyPatch({ bars: 8, bpm: 80 }))).toBeCloseTo(24);
  });

  it("computeLoopSeconds: honors meter override", () => {
    expect(computeLoopSeconds(emptyPatch({ bars: 8, bpm: 120, meter: 3 }))).toBeCloseTo(12);
  });
});

describe("scheduleOneLoop", () => {
  let ctx: AudioContext;
  let dest: FakeNode;

  beforeEach(() => {
    ctx = makeCtx();
    dest = new FakeNode();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules every midi in a chord event at the same start time", () => {
    const patch = emptyPatch({
      bpm: 120,
      bars: 1,
      tracks: {
        chords: {
          enabled: true,
          volume: 0.5,
          instrument: "warm-pad",
          events: [
            { bar: 1, beat: 1, durationBeats: 2, velocity: 0.5, midis: [60, 64, 67] },
          ],
        },
      },
    });

    scheduleOneLoop(ctx, dest as unknown as AudioNode, patch, 10);

    const fake = ctx as unknown as FakeAudioContext;
    // warm-pad has no partials => one oscillator per chord note => 3 total
    expect(fake.oscillators.length).toBe(3);
    fake.oscillators.forEach((osc) => {
      expect(osc.start).toHaveBeenCalledWith(10);
    });
    const freqs = fake.oscillators.map((o) => o.frequency.value).sort((a, b) => a - b);
    expect(freqs[0]).toBeCloseTo(midiToFrequency(60));
    expect(freqs[1]).toBeCloseTo(midiToFrequency(64));
    expect(freqs[2]).toBeCloseTo(midiToFrequency(67));
  });

  it("uses track.instrument as the kit id when scheduling drum events", () => {
    const patch = emptyPatch({
      bpm: 120,
      bars: 1,
      tracks: {
        drums: {
          enabled: true,
          volume: 1,
          instrument: "bit-crushed-lofi",
          events: [
            { bar: 1, beat: 1, durationBeats: 0.1, velocity: 0.8, drum: "kick" },
          ],
        },
      },
    });

    scheduleOneLoop(ctx, dest as unknown as AudioNode, patch, 5);

    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.bufferSources.length).toBe(1);
    // bit-crushed-lofi kick: kickType "lowpass", kick freq 200
    const kickFilter = fake.filters.find((f) => f.frequency.value === 200);
    expect(kickFilter).toBeDefined();
    expect(kickFilter?.type).toBe("lowpass");
  });

  it("skips disabled tracks", () => {
    const patch = emptyPatch({
      bpm: 120,
      bars: 1,
      tracks: {
        melody: {
          enabled: false,
          volume: 1,
          instrument: "bright-lead",
          events: [
            { bar: 1, beat: 1, durationBeats: 1, velocity: 1, midi: 72 },
          ],
        },
      },
    });

    scheduleOneLoop(ctx, dest as unknown as AudioNode, patch, 0);

    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.oscillators.length).toBe(0);
    expect(fake.bufferSources.length).toBe(0);
  });

  it("falls back to sine-wave when track instrument is unknown", () => {
    const patch = emptyPatch({
      bpm: 120,
      bars: 1,
      tracks: {
        melody: {
          enabled: true,
          volume: 1,
          instrument: "totally-not-a-real-instrument",
          events: [
            { bar: 1, beat: 1, durationBeats: 1, velocity: 1, midi: 69 },
          ],
        },
      },
    });

    expect(() =>
      scheduleOneLoop(ctx, dest as unknown as AudioNode, patch, 0),
    ).not.toThrow();

    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.oscillators.length).toBe(1);
    expect(fake.oscillators[0].type).toBe("sine"); // sine-wave fallback
    expect(fake.oscillators[0].frequency.value).toBeCloseTo(midiToFrequency(69));
  });

  it("schedules note events at the correct loop-relative offset", () => {
    const patch = emptyPatch({
      bpm: 120,
      bars: 4,
      tracks: {
        melody: {
          enabled: true,
          volume: 1,
          instrument: "sine-wave",
          events: [
            { bar: 2, beat: 3, durationBeats: 1, velocity: 1, midi: 72 },
          ],
        },
      },
    });

    scheduleOneLoop(ctx, dest as unknown as AudioNode, patch, 100);

    const fake = ctx as unknown as FakeAudioContext;
    expect(fake.oscillators.length).toBe(1);
    // bar 2 beat 3 = (1*4 + 2) * 0.5 = 3.0s after loop start
    expect(fake.oscillators[0].start).toHaveBeenCalledWith(103);
  });
});
