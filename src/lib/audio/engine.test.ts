import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "./engine";

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn(function setValueAtTime(this: FakeParam, value: number) {
    this.value = value;
  });
  linearRampToValueAtTime = vi.fn(function linearRampToValueAtTime(this: FakeParam, value: number) {
    this.value = value;
  });
  exponentialRampToValueAtTime = vi.fn(function exponentialRampToValueAtTime(this: FakeParam, value: number) {
    this.value = value;
  });
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeNode {
  gain = new FakeParam();
}

class FakeOscillatorNode extends FakeNode {
  type: OscillatorType = "sine";
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
}

class FakeStereoPannerNode extends FakeNode {
  pan = new FakeParam();
}

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  resume = vi.fn(async () => undefined);
  createGain = vi.fn(() => new FakeGainNode());
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createStereoPanner = vi.fn(() => new FakeStereoPannerNode());
}

function installFakeWindow(context: FakeAudioContext) {
  const listeners = new Map<string, () => void>();
  const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === "function") listeners.set(type, listener as () => void);
  });
  const removeEventListener = vi.fn((type: string) => {
    listeners.delete(type);
  });
  function FakeCtor(this: unknown) {
    return context;
  }
  Object.defineProperty(globalThis, "window", {
    value: { AudioContext: FakeCtor, addEventListener, removeEventListener },
    configurable: true,
  });
  return {
    addEventListener,
    trigger: (type: string) => listeners.get(type)?.(),
  };
}

describe("createAudioEngine", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalWindow) globalThis.window = originalWindow;
    else delete (globalThis as { window?: Window }).window;
  });

  it("is safe without Web Audio", () => {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    const engine = createAudioEngine();
    expect(() => engine.armOnGesture()).not.toThrow();
    expect(() => engine.setMute(true)).not.toThrow();
    expect(() => engine.setVolume(0.2)).not.toThrow();
    expect(() => engine.setScenario("story")).not.toThrow();
    expect(() => engine.setSoundtrack("auto")).not.toThrow();
    expect(() => engine.sfx("tap")).not.toThrow();
  });

  it("clamps volume between 0 and 1", () => {
    const context = new FakeAudioContext();
    const { trigger } = installFakeWindow(context);
    const engine = createAudioEngine();
    engine.armOnGesture();
    trigger("pointerdown");

    engine.setVolume(5);
    engine.setVolume(-3);

    const gainCalls = context.createGain.mock.results;
    expect(gainCalls.length).toBeGreaterThan(0);
    const masterGain = gainCalls[0].value as FakeGainNode;
    const ramps = masterGain.gain.linearRampToValueAtTime.mock.calls.map((call) => call[0]);
    expect(ramps).toContain(0.45);
    expect(ramps).toContain(0);
  });

  it("setMute(true) prevents SFX scheduling", () => {
    const context = new FakeAudioContext();
    const { trigger } = installFakeWindow(context);
    const engine = createAudioEngine();
    engine.armOnGesture();
    trigger("pointerdown");
    engine.setMute(true);
    engine.sfx("success");
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("manual soundtrack override beats scenario, auto restores scenario control", () => {
    const context = new FakeAudioContext();
    const { trigger } = installFakeWindow(context);
    const engine = createAudioEngine();
    engine.armOnGesture();
    trigger("pointerdown");

    engine.setScenario("story");
    context.currentTime = 1;
    vi.advanceTimersByTime(900);
    const beforeOverride = context.createOscillator.mock.calls.length;

    engine.setSoundtrack("happy");
    engine.setScenario("challengeActive");
    context.currentTime = 2;
    vi.advanceTimersByTime(900);
    const duringOverride = context.createOscillator.mock.calls.length;

    engine.setSoundtrack("auto");
    context.currentTime = 3;
    vi.advanceTimersByTime(900);
    const afterAuto = context.createOscillator.mock.calls.length;

    expect(beforeOverride).toBeGreaterThan(0);
    expect(duringOverride).toBeGreaterThan(beforeOverride);
    expect(afterAuto).toBeGreaterThan(duringOverride);
  });


  it("idle auto soundtrack selects night after 7pm and midnight from 12am-6am", () => {
    const context = new FakeAudioContext();
    const { trigger } = installFakeWindow(context);
    const engine = createAudioEngine();
    engine.armOnGesture();
    trigger("pointerdown");

    vi.setSystemTime(new Date("2026-05-17T20:00:00.000Z"));
    engine.setScenario("story");
    engine.setSoundtrack("auto");
    engine.setScenario("idle");
    context.currentTime = 1;
    vi.advanceTimersByTime(900);
    const atNight = context.createOscillator.mock.calls.length;

    vi.setSystemTime(new Date("2026-05-17T01:00:00.000Z"));
    engine.setScenario("idle");
    context.currentTime = 2;
    vi.advanceTimersByTime(900);
    const atMidnight = context.createOscillator.mock.calls.length;

    expect(atNight).toBeGreaterThan(0);
    expect(atMidnight).toBeGreaterThan(atNight);
  });

  it("repeated armOnGesture() does not duplicate listeners", () => {
    const context = new FakeAudioContext();
    const { addEventListener } = installFakeWindow(context);
    const engine = createAudioEngine();
    engine.armOnGesture();
    engine.armOnGesture();
    expect(addEventListener).toHaveBeenCalledTimes(3);
  });
});
