import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSoundtrack, createAudioEngine, type AudioScenario } from "./engine";
import type { PatchSoundtrackId } from "./patches";

describe("resolveSoundtrack", () => {
  function call(args: {
    scenario?: AudioScenario;
    soundtrack?: "auto" | PatchSoundtrackId;
    overrides?: Array<[string, PatchSoundtrackId]>;
  }) {
    return resolveSoundtrack({
      scenario: args.scenario ?? "default-day",
      soundtrack: args.soundtrack ?? "auto",
      overrides: new Map(args.overrides ?? []),
    });
  }

  it("returns the auto-scenario song when no overrides and soundtrack=auto", () => {
    expect(call({ scenario: "default-day" })).toBe("song4_day");
    expect(call({ scenario: "default-night" })).toBe("song4_night");
    expect(call({ scenario: "story" })).toBe("song7_story");
    expect(call({ scenario: "trophy" })).toBe("song8_trophy");
    expect(call({ scenario: "vote" })).toBe("song6_vote");
  });

  it("returns the user's manual pick when soundtrack is not auto", () => {
    expect(call({ scenario: "story", soundtrack: "song4_day" })).toBe("song4_day");
    expect(call({ scenario: "trophy", soundtrack: "song4_night" })).toBe("song4_night");
  });

  it("override beats manual mode (intro / vote splash / credits force the song)", () => {
    expect(
      call({
        scenario: "default-day",
        soundtrack: "song4_day",
        overrides: [["intro", "song9_intro"]],
      }),
    ).toBe("song9_intro");
  });

  it("override beats auto-scenario routing", () => {
    expect(
      call({
        scenario: "story",
        soundtrack: "auto",
        overrides: [["credits", "song10_credits"]],
      }),
    ).toBe("song10_credits");
  });

  it("most-recently-inserted override wins (LIFO)", () => {
    expect(
      call({
        overrides: [
          ["intro", "song9_intro"],
          ["credits", "song10_credits"],
        ],
      }),
    ).toBe("song10_credits");
    expect(
      call({
        overrides: [
          ["credits", "song10_credits"],
          ["intro", "song9_intro"],
        ],
      }),
    ).toBe("song9_intro");
  });
});

class FakeAudioParam {
  value = 0;
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  exponentialRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
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

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeDelay extends FakeNode {
  delayTime = new FakeAudioParam();
}

class FakeAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];

  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() { return new FakeFilter(); }
  createOscillator() {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBuffer(_c: number, length: number) {
    const channel = new Float32Array(length);
    return { getChannelData: () => channel };
  }
  createBufferSource() {
    const s = new FakeBufferSource();
    this.bufferSources.push(s);
    return s;
  }
  createDelay() { return new FakeDelay(); }
}

let contexts: FakeAudioContext[];

class FakeAudioContextCtor extends FakeAudioContext {
  constructor() {
    super();
    contexts.push(this);
  }
}

function arm() {
  const engine = createAudioEngine();
  engine.armOnGesture();
  window.dispatchEvent(new Event("pointerdown"));
  return engine;
}

describe("AudioEngine override behavior", () => {
  beforeEach(() => {
    contexts = [];
    vi.useFakeTimers();
    vi.stubGlobal("AudioContext", FakeAudioContextCtor);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("setOverride pushes resolution immediately for new entries", () => {
    const engine = arm();
    expect(engine.getResolution()).toBe("song4_day");
    engine.setOverride("intro", "song9_intro");
    expect(engine.getResolution()).toBe("song9_intro");
  });

  it("setOverride(null) defers the resolution recompute (~250 ms)", () => {
    const engine = arm();
    engine.setOverride("intro", "song9_intro");
    expect(engine.getResolution()).toBe("song9_intro");
    engine.setOverride("intro", null);
    // Still on song9_intro until the deferred timer fires.
    expect(engine.getResolution()).toBe("song9_intro");
    vi.advanceTimersByTime(260);
    expect(engine.getResolution()).toBe("song4_day");
  });

  it("a scenario change inside the defer window supersedes the pending recompute", () => {
    const engine = arm();
    engine.setOverride("vote-splash", "song6_vote");
    engine.setOverride("vote-splash", null);
    // Within 250 ms, the racing scenario change lands.
    engine.setScenario("vote");
    // Resolution is now driven by the scenario; deferred clear shouldn't
    // reintroduce a swap.
    expect(engine.getResolution()).toBe("song6_vote");
    vi.advanceTimersByTime(260);
    expect(engine.getResolution()).toBe("song6_vote");
  });

  it("notifies resolution listeners on change", () => {
    const engine = arm();
    const cb = vi.fn();
    engine.onResolutionChange(cb);
    engine.setOverride("intro", "song9_intro");
    expect(cb).toHaveBeenCalledWith("song9_intro");
  });

  it("flushes the patchBus on the silenced -> unsilenced transition", () => {
    const engine = arm();
    const ctx = contexts[0]!;
    const gainsBefore = ctx.gains.length;
    engine.setMute(true);
    // No new gain created on mute alone.
    expect(ctx.gains.length).toBe(gainsBefore);
    engine.setMute(false);
    // Unmute should have created a new patchBus gain.
    expect(ctx.gains.length).toBeGreaterThan(gainsBefore);
  });
});
