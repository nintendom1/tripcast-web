import type { BreadcrumbSampleReason, BreadcrumbSamplerState, GeoFix } from "./breadcrumbSampler";
import { distanceMeters } from "./geoUtils";

export const LEGACY_LIVE_TRAIL_MIN_DISTANCE_METERS = 200;
export const LEGACY_LIVE_TRAIL_MIN_INTERVAL_MS = 60_000;

/**
 * Pre-PR-172 breadcrumb sampler. Emits when EITHER 200m of movement OR 60s
 * have elapsed since the last emitted fix. Shares BreadcrumbSamplerState
 * with the relevant sampler so callers can dispatch behind a single ref.
 */
export function evaluateLegacyBreadcrumbSample(
  state: BreadcrumbSamplerState,
  fix: GeoFix,
  force = false,
): {
  shouldEmit: boolean;
  reason?: BreadcrumbSampleReason;
  nextState: BreadcrumbSamplerState;
} {
  const last = state.lastEmitted;
  const elapsed = last ? fix.sampledAt - last.sampledAt : Number.POSITIVE_INFINITY;
  const movedMeters = last ? distanceMeters(last, fix) : Number.POSITIVE_INFINITY;

  let shouldEmit = force || !last;
  let reason: BreadcrumbSampleReason | undefined =
    force ? "force" : !last ? "initial" : undefined;

  if (!shouldEmit && last) {
    if (movedMeters >= LEGACY_LIVE_TRAIL_MIN_DISTANCE_METERS) {
      shouldEmit = true;
      reason = "distance";
    } else if (elapsed >= LEGACY_LIVE_TRAIL_MIN_INTERVAL_MS) {
      shouldEmit = true;
      reason = "heartbeat";
    }
  }

  const nextState: BreadcrumbSamplerState = { ...state };
  if (shouldEmit) {
    nextState.lastEmitted = { lat: fix.lat, lon: fix.lon, sampledAt: fix.sampledAt, accuracy: fix.accuracy };
  }
  return { shouldEmit, reason, nextState };
}
