// Movement Auto-State unit helpers.
// DB stores thresholds in m/s (SI). UI lets the user pick mph for both bands
// so the mental model is consistent across Walking and Moving.

const MPH_TO_MPS = 0.44704;
const KMH_TO_MPS = 1 / 3.6;

export function mphToMps(v: number): number {
  return v * MPH_TO_MPS;
}

export function mpsToMph(v: number): number {
  return v / MPH_TO_MPS;
}

export function mpsToKmh(v: number): number {
  return v / KMH_TO_MPS;
}

export const DEFAULT_WALKING_MPH = 2;
export const DEFAULT_MOVING_MPH = 20;
export const DEFAULT_WALKING_MPS = mphToMps(DEFAULT_WALKING_MPH);
export const DEFAULT_MOVING_MPS = mphToMps(DEFAULT_MOVING_MPH);
