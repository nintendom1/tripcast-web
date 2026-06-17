import { calculateBearing, distanceMeters, getAngleDifference, type LatLon } from "./geoUtils";

export type GeoFix = LatLon & {
  accuracy?: number;
  sampledAt: number;
};

export type BreadcrumbSampleReason = "initial" | "force" | "distance" | "heartbeat" | "turn";

export type BreadcrumbSamplerState = {
  lastEmitted?: GeoFix & { bearing?: number };
  previousFix?: GeoFix;
};

export type BreadcrumbSamplerConfig = {
  minDistanceMeters: number;
  maxIntervalMs: number;
  turnThresholdDegrees: number;
  /** Minimum distance required from previous fix to establish a new bearing segment. */
  bearingHopMeters: number;
  /** Minimum distance moved from last emitted point to consider a turn valid (noise guard). */
  turnMovementGuardMeters: number;
  /** Floor: never emit twice within this many ms of the last emit (0 disables). Caps spam at high speed. */
  minIntervalMs: number;
};

export const DEFAULT_SAMPLER_CONFIG: BreadcrumbSamplerConfig = {
  minDistanceMeters: 50,
  maxIntervalMs: 120_000,
  turnThresholdDegrees: 22.5,
  bearingHopMeters: 5,
  turnMovementGuardMeters: 10,
  minIntervalMs: 0,
};

export const PRECISE_SAMPLER_CONFIG: BreadcrumbSamplerConfig = {
  minDistanceMeters: 10,
  maxIntervalMs: 60_000,
  turnThresholdDegrees: 18,
  bearingHopMeters: 3,
  turnMovementGuardMeters: 4,
  minIntervalMs: 3_000,
};

/**
 * Pure state machine for GPS track sampling. Determines if a new fix is "relevant"
 * enough to emit as a breadcrumb.
 */
export function evaluateBreadcrumbSample(
  state: BreadcrumbSamplerState,
  fix: GeoFix,
  config: BreadcrumbSamplerConfig = DEFAULT_SAMPLER_CONFIG,
  force = false,
): {
  shouldEmit: boolean;
  reason?: BreadcrumbSampleReason;
  nextState: BreadcrumbSamplerState;
} {
  const last = state.lastEmitted;
  const prevFix = state.previousFix;

  const elapsed = last ? fix.sampledAt - last.sampledAt : Number.POSITIVE_INFINITY;
  const movedMeters = last ? distanceMeters(last, fix) : Number.POSITIVE_INFINITY;
  const hopMeters = prevFix ? distanceMeters(prevFix, fix) : 0;

  let shouldEmit = force || !last;
  let reason: BreadcrumbSampleReason | undefined = force ? "force" : !last ? "initial" : undefined;
  let currentBearing: number | undefined;

  // Min-interval floor: short-circuit emit triggers when the previous emit was
  // too recent. Bearing bootstrap + previousFix update below still run, so
  // turn-detection state stays current. Force emits bypass this floor.
  const flooredOut = !!last && config.minIntervalMs > 0 && elapsed < config.minIntervalMs;

  if (!shouldEmit && last && !flooredOut) {
    // 1. Time-based heartbeat
    if (elapsed >= config.maxIntervalMs) {
      shouldEmit = true;
      reason = "heartbeat";
    }
    // 2. Distance-based deadband
    else if (movedMeters >= config.minDistanceMeters) {
      shouldEmit = true;
      reason = "distance";
    }
    // 3. Turn detection
    // Accuracy-aware guard: if fix is inaccurate, require more movement before trusting a turn.
    const accuracy = fix.accuracy ?? 0;
    const dynamicGuard = Math.max(config.turnMovementGuardMeters, accuracy / 2);

    if (prevFix && hopMeters >= config.bearingHopMeters && movedMeters >= dynamicGuard) {
      currentBearing = calculateBearing(prevFix, fix);
      if (last.bearing !== undefined) {
        const turnAngle = getAngleDifference(last.bearing, currentBearing);
        if (turnAngle >= config.turnThresholdDegrees) {
          shouldEmit = true;
          reason = "turn";
        }
      }
    }
  }

  const nextState: BreadcrumbSamplerState = {
    ...state,
    // Always update previousFix if we've moved enough to create a new bearing baseline
    previousFix: (!prevFix || hopMeters >= config.bearingHopMeters) ? fix : prevFix,
  };

  // Bearing bootstrap: if the last emitted point still has no bearing (typically
  // because it was the initial/forced emit), seed it from the first fix that is
  // far enough away. Without this, turn detection stays disabled until some
  // other reason (distance/heartbeat) fires and writes a bearing — which never
  // happens on a tight loop.
  if (!shouldEmit && last && last.bearing === undefined && movedMeters >= config.bearingHopMeters) {
    nextState.lastEmitted = { ...last, bearing: calculateBearing(last, fix) };
  }

  if (shouldEmit) {
    // Determine the finalized bearing for the emitted point.
    // If we just calculated one for turn detection, reuse it.
    // Otherwise, try to derive one if we've moved enough since the last baseline fix.
    let finalizedBearing = currentBearing;
    if (finalizedBearing === undefined && prevFix && hopMeters >= config.bearingHopMeters) {
      finalizedBearing = calculateBearing(prevFix, fix);
    }

    nextState.lastEmitted = {
      ...fix,
      bearing: finalizedBearing,
    };
    // Reset baseline fix for the next point's turn detection
    nextState.previousFix = fix;
  }

  return { shouldEmit, reason, nextState };
}
