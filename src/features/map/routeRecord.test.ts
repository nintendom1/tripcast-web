import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NativeRouteBlock, NativeRoutePoint } from "../../native/nativeLocationManager";
import {
  applyRouteBlock,
  buildFallbackTravelerPathSamples,
  buildTravelerPathSamples,
  emptyRouteRecord,
  routeRequestOf,
  routeWindowStart,
} from "./routeRecord";

// A zone with daylight saving: local times below are built with the local `Date` constructor.
const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = previousTz;
});
afterEach(() => {
  vi.useRealTimers();
});

const HOUR = 3_600_000;
const MINUTE = 60_000;
const local = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const at = (month: number, day: number, hour: number, minute = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(local(month, day, hour, minute));
  return Date.now();
};

function point(seq: number, sampledAt: number): NativeRoutePoint {
  return { clientSampleId: `r-${seq}`, lat: 47 + seq / 10_000, lon: -122 - seq / 10_000, sampledAt, seq };
}
function cacheRow(id: string, lat: number, lon: number, sampledAt: number) {
  return { _id: id, lat, lon, sampledAt };
}
function block(overrides: Partial<NativeRouteBlock>): NativeRouteBlock {
  return {
    tripId: "trip-a",
    generation: "g1",
    replace: false,
    firstSeq: 1,
    lastSeq: 0,
    points: [],
    recordSize: 0,
    totalSize: 0,
    bytesOnDisk: 0,
    prunedSinceLastRead: 0,
    ...overrides,
  };
}

describe("routeWindowStart", () => {
  it("reaches back 6 hours just after midnight: at 01:00 it starts at 19:00 the day before", () => {
    expect(new Date(local(11, 15, 1)).getTimezoneOffset()).toBe(300);
    const now = at(11, 15, 1);
    expect(routeWindowStart(now)).toBe(local(11, 14, 19));
  });

  it("starts at local midnight late in the day: at 23:00 it starts at 00:00", () => {
    const now = at(11, 15, 23);
    expect(routeWindowStart(now)).toBe(local(11, 15, 0));
  });

  it("uses the phone's local midnight on daylight-saving change days", () => {
    // Spring forward (2026-03-08): 00:00 EST to 09:00 EDT is 8 hours.
    expect(new Date(local(3, 8, 9)).getTimezoneOffset()).toBe(240);
    let now = at(3, 8, 9);
    expect(routeWindowStart(now)).toBe(Date.UTC(2026, 2, 8, 5));
    expect(now - routeWindowStart(now)).toBe(8 * HOUR);
    // Fall back (2026-11-01): 00:00 EDT to 09:00 EST is 10 hours.
    now = at(11, 1, 9);
    expect(routeWindowStart(now)).toBe(Date.UTC(2026, 10, 1, 4));
    expect(now - routeWindowStart(now)).toBe(10 * HOUR);
  });
});

describe("buildTravelerPathSamples", () => {
  it("draws the whole day's record, not only the newest 100 points", () => {
    const now = at(11, 15, 14);
    const yesterday = Array.from({ length: 50 }, (_, i) => point(i + 1, local(11, 14, 20) + i * MINUTE));
    const today = Array.from({ length: 600 }, (_, i) => point(i + 51, local(11, 15, 0, 30) + i * MINUTE));

    const { samples, stats } = buildTravelerPathSamples({ cacheRows: [], record: [...yesterday, ...today], pendingIds: new Set(), now });

    expect(samples).toEqual(today);
    expect(stats).toEqual({
      recordInWindow: 600,
      cacheInWindow: 0,
      pendingExcluded: 0,
      duplicates: 0,
      drawnCount: 600,
      cut: "window",
      windowHours: 14,
    });
  });

  it("never draws fewer than the newest 100 points: early in the day yesterday's tail stays", () => {
    const now = at(11, 15, 7);
    const yesterday = Array.from({ length: 200 }, (_, i) => point(i + 1, local(11, 14, 18) + i * MINUTE));
    const today = Array.from({ length: 30 }, (_, i) => point(i + 201, local(11, 15, 6) + i * MINUTE));

    const { samples, stats } = buildTravelerPathSamples({ cacheRows: [], record: [...yesterday, ...today], pendingIds: new Set(), now });

    expect(samples).toEqual([...yesterday.slice(-70), ...today]);
    expect(stats).toEqual(expect.objectContaining({ drawnCount: 100, cut: "newest-100", windowHours: 7 }));
  });

  it("merges the cache rows in time order, the cache row winning a duplicate, and leaves out pending entries", () => {
    const now = at(11, 15, 12);
    const record = [1, 2, 3, 4].map((seq) => point(seq, local(11, 15, 9, seq)));
    const sameAsRecord = cacheRow("server-3", record[2].lat, record[2].lon, record[2].sampledAt);
    const otherDevice = cacheRow("server-x", 46, -121, local(11, 15, 9, 2) + 30_000);

    const { samples, stats } = buildTravelerPathSamples({
      cacheRows: [sameAsRecord, otherDevice],
      record,
      pendingIds: new Set(["r-4"]),
      now,
    });

    expect(samples).toEqual([record[0], record[1], otherDevice, sameAsRecord]);
    expect(samples[3]).toBe(sameAsRecord);
    expect(stats).toEqual(expect.objectContaining({
      recordInWindow: 2,
      cacheInWindow: 2,
      pendingExcluded: 1,
      duplicates: 1,
      drawnCount: 4,
    }));
  });

  it("leaves out record entries before the cutoff the cache rows are filtered to", () => {
    const now = at(11, 15, 12);
    const record = [1, 2, 3].map((seq) => point(seq, local(11, 15, 9, seq)));

    const { samples } = buildTravelerPathSamples({ cacheRows: [], record, pendingIds: new Set(), cutoffAt: local(11, 15, 9, 2), now });

    expect(samples).toEqual(record.slice(1));
  });
});

describe("applyRouteBlock", () => {
  it("takes a whole record, then appends deltas, drops entries below firstSeq and asks only for what it lacks", () => {
    const empty = emptyRouteRecord("trip-a");
    expect(routeRequestOf(empty)).toEqual({ tripId: "trip-a", sinceSeq: null, generation: null });

    const first = applyRouteBlock(empty, block({ replace: true, lastSeq: 3, points: [point(1, 1), point(2, 2), point(3, 3)] }));
    expect(first.result).toBe("replaced");
    expect(first.state.points.map((p) => p.seq)).toEqual([1, 2, 3]);
    expect(routeRequestOf(first.state)).toEqual({ tripId: "trip-a", sinceSeq: 3, generation: "g1" });

    const delta = applyRouteBlock(first.state, block({ firstSeq: 2, lastSeq: 5, points: [point(4, 4), point(5, 5)] }));
    expect(delta.result).toBe("applied");
    expect(delta.state.points.map((p) => p.seq)).toEqual([2, 3, 4, 5]);
    expect(routeRequestOf(delta.state)).toEqual({ tripId: "trip-a", sinceSeq: 5, generation: "g1" });

    const unchanged = applyRouteBlock(delta.state, block({ firstSeq: 2, lastSeq: 5 }));
    expect(unchanged.result).toBe("unchanged");
    expect(unchanged.state).toBe(delta.state);

    // A removal (new generation): the whole record again.
    const replaced = applyRouteBlock(delta.state, block({ generation: "g2", replace: true, firstSeq: 2, lastSeq: 5, points: [point(2, 2), point(5, 5)] }));
    expect(replaced.result).toBe("replaced");
    expect(replaced.state).toEqual({ tripId: "trip-a", generation: "g2", lastSeq: 5, points: [point(2, 2), point(5, 5)] });
  });

  it("drops a block for a trip no longer shown and a delta answering an older request", () => {
    const held = applyRouteBlock(emptyRouteRecord("trip-a"), block({ replace: true, lastSeq: 1, points: [point(1, 1)] })).state;

    const otherTrip = applyRouteBlock(held, block({ tripId: "trip-b", replace: true, lastSeq: 9, points: [point(9, 9)] }));
    expect(otherTrip).toEqual({ state: held, result: "trip-mismatch" });
    expect(applyRouteBlock(emptyRouteRecord(null), block({ replace: true, lastSeq: 1 })).result).toBe("trip-mismatch");

    const olderGeneration = applyRouteBlock(held, block({ generation: "g0", lastSeq: 2, points: [point(2, 2)] }));
    expect(olderGeneration).toEqual({ state: held, result: "stale" });
    // Nothing held (a reset since the request): only a whole record applies.
    expect(applyRouteBlock(emptyRouteRecord("trip-a"), block({ lastSeq: 2, points: [point(2, 2)] })).result).toBe("stale");
  });
});

describe("buildFallbackTravelerPathSamples", () => {
  // The builder before the route record, verbatim: the fallback must keep its output exactly.
  function previousBuilder<T extends { lat: number; lon: number; sampledAt: number }>(
    base: T[],
    acknowledged: T[],
    inReplayWindow: (ts: number) => boolean,
  ) {
    return [...base, ...acknowledged]
      .filter((sample, index, rows) => inReplayWindow(sample.sampledAt) && rows.findIndex((candidate) =>
        candidate.sampledAt === sample.sampledAt && candidate.lat === sample.lat && candidate.lon === sample.lon,
      ) === index)
      .sort((a, b) => a.sampledAt - b.sampledAt)
      .slice(-100);
  }

  it("equals the previous builder: first row wins, NaN rows dropped, time order, newest 100", () => {
    const base = Array.from({ length: 120 }, (_, i) => ({
      clientSampleId: `c-${i}`,
      lat: 47 + (i % 7) / 100,
      lon: -122,
      sampledAt: 1_000 + ((i * 37) % 120) * 10,
    }));
    const acknowledged = [
      ...base.slice(100, 110).map((row) => ({ ...row, clientSampleId: `ack-${row.clientSampleId}` })),
      { clientSampleId: "nan", lat: Number.NaN, lon: -122, sampledAt: 2_195 },
      { clientSampleId: "tie", lat: 48, lon: -122, sampledAt: 2_190 },
      ...Array.from({ length: 20 }, (_, i) => ({ clientSampleId: `ack-${i}`, lat: 46, lon: -121, sampledAt: 2_200 + i })),
    ];

    for (const inWindow of [() => true, (ts: number) => ts % 20 !== 0]) {
      const expected = previousBuilder(base, acknowledged, inWindow);
      const actual = buildFallbackTravelerPathSamples(base, acknowledged, inWindow);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((row, index) => expect(row).toBe(expected[index]));
    }
  });
});
