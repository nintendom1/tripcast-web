import { describe, expect, it } from "vitest";
import {
  evaluateBreadcrumbSample,
  SAMPLER_CONFIGS,
  SERVER_LIVE_TRAIL_FILTER,
  type BreadcrumbSamplerState,
  type GeoFix,
} from "./breadcrumbSampler";
import { distanceMeters } from "./geoUtils";
import type { SamplerMode } from "./samplerMode";

const MODES: SamplerMode[] = ["relevant", "precise"];
const WHERE = "tripcast-backend/convex/liveTrail.ts";
const M_PER_DEG = 111_320;
const T0 = 1_700_000_000_000;

function fixAt(tSec: number, northM: number, eastM: number): GeoFix {
  return {
    lat: 47.6 + northM / M_PER_DEG,
    lon: -122.3 + eastM / (M_PER_DEG * Math.cos((47.6 * Math.PI) / 180)),
    sampledAt: T0 + tSec * 1000,
  };
}

function jitter(i: number) {
  return Math.sin(i * 12.9898) * 2;
}

const TRACES: Record<string, GeoFix[]> = {
  stationaryJitter: Array.from({ length: 300 }, (_, i) =>
    fixAt(i, jitter(i), jitter(i + 7)),
  ),
  walk: Array.from({ length: 600 }, (_, i) => fixAt(i, i * 1.4, 0)),
  // 25 m/s drive at 1 Hz, then a 90 degree turn after 120 s.
  drive: Array.from({ length: 300 }, (_, i) =>
    i < 120 ? fixAt(i, i * 25, 0) : fixAt(i, 120 * 25, (i - 120) * 25),
  ),
  // Sub-second fixes while driving.
  fastFixes: Array.from({ length: 600 }, (_, i) =>
    fixAt(i * 0.25, i * 6.25, 0),
  ),
};

describe("breadcrumbSampler vs server live-trail filter", () => {
  it(`has one config per SamplerMode and each honours the server floor (${WHERE})`, () => {
    expect(Object.keys(SAMPLER_CONFIGS).sort()).toEqual([...MODES].sort());
    for (const mode of MODES) {
      expect(
        SAMPLER_CONFIGS[mode].minIntervalMs,
        `${mode} minIntervalMs is below the server floor in ${WHERE}; update both together`,
      ).toBeGreaterThanOrEqual(SERVER_LIVE_TRAIL_FILTER.minIntervalMs);
    }
  });

  for (const mode of MODES) {
    for (const [name, trace] of Object.entries(TRACES)) {
      it(`${mode} emits nothing on "${name}" that the server filter would drop`, () => {
        let state: BreadcrumbSamplerState = {};
        let lastKept: GeoFix | undefined;
        let emits = 0;
        for (const fix of trace) {
          const r = evaluateBreadcrumbSample(
            state,
            fix,
            SAMPLER_CONFIGS[mode],
            false,
          );
          state = r.nextState;
          if (!r.shouldEmit) continue;
          emits++;
          if (lastKept) {
            const dropped =
              fix.sampledAt - lastKept.sampledAt <
                SERVER_LIVE_TRAIL_FILTER.minIntervalMs &&
              distanceMeters(lastKept, fix) <
                SERVER_LIVE_TRAIL_FILTER.minDistanceMeters;
            expect(
              dropped,
              `non-forced emit would be dropped by ${WHERE} (${mode}/${name}); client and server filters are out of sync`,
            ).toBe(false);
          }
          lastKept = fix;
        }
        expect(emits).toBeGreaterThan(0);
      });
    }
  }
});
