// Movement Auto-State unit helpers.
// DB stores thresholds in m/s (SI). UI lets the user pick ft/min for Walking
// and mph for Moving — the units that match the order of magnitude of each
// band — so conversion lives here to keep call sites free of magic numbers.

const FT_PER_MIN_TO_MPS = 0.00508; // 1 ft/min = 0.3048/60 m/s
const MPH_TO_MPS = 0.44704;

export function ftPerMinToMps(v: number): number {
  return v * FT_PER_MIN_TO_MPS;
}

export function mpsToFtPerMin(v: number): number {
  return v / FT_PER_MIN_TO_MPS;
}

export function mphToMps(v: number): number {
  return v * MPH_TO_MPS;
}

export function mpsToMph(v: number): number {
  return v / MPH_TO_MPS;
}

export const DEFAULT_WALKING_FT_PER_MIN = 500;
export const DEFAULT_MOVING_MPH = 20;
export const DEFAULT_WALKING_MPS = ftPerMinToMps(DEFAULT_WALKING_FT_PER_MIN);
export const DEFAULT_MOVING_MPS = mphToMps(DEFAULT_MOVING_MPH);
