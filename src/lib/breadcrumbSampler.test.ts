import { describe, expect, it } from "vitest";
import { evaluateBreadcrumbSample, type BreadcrumbSamplerState, type GeoFix } from "./breadcrumbSampler";

describe("breadcrumbSampler", () => {
  const initialFix: GeoFix = { lat: 47.6, lon: -122.3, sampledAt: 1000 };

  it("emits the very first point as 'initial'", () => {
    const result = evaluateBreadcrumbSample({}, initialFix);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("initial");
    expect(result.nextState.lastEmitted?.lat).toBe(initialFix.lat);
  });

  it("emits forced points", () => {
    const state: BreadcrumbSamplerState = { lastEmitted: initialFix };
    const result = evaluateBreadcrumbSample(state, initialFix, undefined, true);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("force");
  });

  it("emits based on distance threshold", () => {
    const state: BreadcrumbSamplerState = { lastEmitted: initialFix };
    // 0.0005 deg lat is ~55m
    const moveFix: GeoFix = { lat: 47.6005, lon: -122.3, sampledAt: 2000 };
    const result = evaluateBreadcrumbSample(state, moveFix);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("distance");
  });

  it("emits based on time heartbeat", () => {
    const state: BreadcrumbSamplerState = { lastEmitted: initialFix };
    const timeFix: GeoFix = { lat: 47.6, lon: -122.3, sampledAt: 1000 + 121_000 };
    const result = evaluateBreadcrumbSample(state, timeFix);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("heartbeat");
  });

  it("suppresses stationary noise", () => {
    const state: BreadcrumbSamplerState = { lastEmitted: initialFix };
    const jitterFix: GeoFix = { lat: 47.6001, lon: -122.3001, sampledAt: 2000 }; // ~14m
    const result = evaluateBreadcrumbSample(state, jitterFix);
    expect(result.shouldEmit).toBe(false);
  });

  it("detects turns ≥ 22.5 degrees", () => {
    // 1. Initial point
    let result = evaluateBreadcrumbSample({}, initialFix);
    let state = result.nextState;

    // 2. Establish bearing (North: 0 deg)
    const northFix: GeoFix = { lat: 47.601, lon: -122.3, sampledAt: 2000 }; // +111m
    result = evaluateBreadcrumbSample(state, northFix);
    expect(result.reason).toBe("distance");
    state = result.nextState;
    expect(state.lastEmitted?.bearing).toBeCloseTo(0, 0);

    // 3. Move North a bit more (no emit)
    const northFix2: GeoFix = { lat: 47.6011, lon: -122.3, sampledAt: 3000 }; // +11m from last emitted
    result = evaluateBreadcrumbSample(state, northFix2);
    expect(result.shouldEmit).toBe(false);
    state = result.nextState;

    // 4. Turn East (90 deg)
    const eastFix: GeoFix = { lat: 47.6011, lon: -122.2998, sampledAt: 4000 }; // ~15m East from previous fix
    result = evaluateBreadcrumbSample(state, eastFix);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("turn");
  });

  it("ignores small turns < 22.5 degrees", () => {
    // 1. Initial point
    let result = evaluateBreadcrumbSample({}, initialFix);
    let state = result.nextState;

    // 2. Establish bearing (North: 0 deg)
    const northFix: GeoFix = { lat: 47.601, lon: -122.3, sampledAt: 2000 };
    result = evaluateBreadcrumbSample(state, northFix);
    state = result.nextState;

    // 3. Turn slightly (e.g. 10 degrees)
    // 0.0001 deg lon at this lat is ~7.5m.
    // To get ~10 deg turn from north: sin(10) * 15m ≈ 2.6m East.
    // 2.6m East is ~0.000035 deg lon.
    const slightTurnFix: GeoFix = { lat: 47.60113, lon: -122.300035, sampledAt: 3000 };
    result = evaluateBreadcrumbSample(state, slightTurnFix);
    expect(result.shouldEmit).toBe(false);
  });

  it("is accuracy-aware for turn detection", () => {
    // 1. Initial point
    let result = evaluateBreadcrumbSample({}, initialFix);
    let state = result.nextState;

    // 2. Establish bearing (North)
    const northFix: GeoFix = { lat: 47.601, lon: -122.3, sampledAt: 2000 };
    result = evaluateBreadcrumbSample(state, northFix);
    state = result.nextState;

    // 3. Sharp turn but high inaccuracy
    const noisyFix: GeoFix = {
      lat: 47.6011,
      lon: -122.2998,
      sampledAt: 3000,
      accuracy: 50 // Dynamic guard will be 25m
    };
    // Distance from last emitted (~111m lat) is only ~15m East.
    // 15m < dynamic guard (25m), so turn should be ignored.
    result = evaluateBreadcrumbSample(state, noisyFix);
    expect(result.shouldEmit).toBe(false);

    // 4. Move further in the new direction
    const noisyFixFar: GeoFix = {
      lat: 47.6011,
      lon: -122.2995,
      sampledAt: 4000,
      accuracy: 50
    }; // ~37m East from last emitted
    result = evaluateBreadcrumbSample(state, noisyFixFar);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("turn");
  });
});
