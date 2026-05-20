import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAudioEngine,
  resolveSoundtrackScenario,
  type AudioScenario,
} from "./engine";
import { deriveTripAudioScenario } from "./useTripAudioScenario";

class FakeAudioParam {
  value = 0;

  setTargetAtTime(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number) {
    this.value = value;
  }

  linearRampToValueAtTime(value: number) {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
}

class FakeNode {
  connect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeDelay extends FakeNode {
  delayTime = new FakeAudioParam();
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
}

class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];

  createGain() {
    return new FakeGain();
  }

  createDelay() {
    return new FakeDelay();
  }

  createBiquadFilter() {
    return new FakeFilter();
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

let contexts: FakeAudioContext[];

class FakeAudioContextCtor extends FakeAudioContext {
  constructor() {
    super();
    contexts.push(this);
  }
}

describe("audio engine", () => {
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

  it.each([
    ["idle", "auto", "idle"],
    ["voteActive", "auto", "vote"],
    ["missionActive", "auto", "mission"],
    ["overBudget", "auto", "overBudget"],
    ["story", "auto", "story"],
    ["voteActive", "cafe", "cafe"],
  ] as const)("resolves %s with %s soundtrack to %s", (scenario, soundtrack, expected) => {
    expect(resolveSoundtrackScenario(scenario, soundtrack)).toBe(expected);
  });

  it("arms on a user gesture before scheduling synth nodes", () => {
    const engine = createAudioEngine();
    engine.armOnGesture();

    window.dispatchEvent(new Event("pointerdown"));

    const context = contexts[0];
    expect(context).toBeDefined();
    expect(context?.oscillators.length).toBeGreaterThan(0);
  });

  it("does not play sfx while muted", () => {
    const engine = createAudioEngine();
    engine.armOnGesture();
    window.dispatchEvent(new Event("pointerdown"));

    const context = contexts[0];
    const before = context?.oscillators.length ?? 0;
    engine.setMute(true);
    engine.sfx("open");

    expect(context?.oscillators.length).toBe(before);
  });
});

describe("deriveTripAudioScenario", () => {
  it("applies scenario priority", () => {
    const input = {
      storyOpen: false,
      overBudget: false,
      voteActive: false,
      missionActive: false,
    };

    expect(deriveTripAudioScenario(input)).toBe<AudioScenario>("idle");
    expect(deriveTripAudioScenario({ ...input, missionActive: true })).toBe("missionActive");
    expect(
      deriveTripAudioScenario({ ...input, missionActive: true, voteActive: true }),
    ).toBe("voteActive");
    expect(
      deriveTripAudioScenario({ ...input, overBudget: true, voteActive: true }),
    ).toBe("overBudget");
    expect(
      deriveTripAudioScenario({ ...input, storyOpen: true, overBudget: true }),
    ).toBe("story");
  });
});
