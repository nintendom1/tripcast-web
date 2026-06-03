import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOVING_MPH,
  DEFAULT_MOVING_MPS,
  DEFAULT_WALKING_MPH,
  DEFAULT_WALKING_MPS,
  mphToMps,
  mpsToKmh,
  mpsToMph,
} from "./movementUnits";

describe("movementUnits", () => {
  it("round-trips mph through m/s without drift", () => {
    expect(mpsToMph(mphToMps(2))).toBeCloseTo(2, 10);
    expect(mpsToMph(mphToMps(20))).toBeCloseTo(20, 10);
  });

  it("converts m/s to km/h", () => {
    expect(mpsToKmh(1)).toBeCloseTo(3.6, 6);
    expect(mpsToKmh(0)).toBe(0);
  });

  it("exposes 2 mph as the walking default and 20 mph as the moving default", () => {
    expect(DEFAULT_WALKING_MPH).toBe(2);
    expect(DEFAULT_MOVING_MPH).toBe(20);
    expect(DEFAULT_WALKING_MPS).toBeCloseTo(0.89408, 5);
    expect(DEFAULT_MOVING_MPS).toBeCloseTo(8.9408, 4);
  });
});
