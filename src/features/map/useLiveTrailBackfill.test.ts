import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi, type LiveTrailReplayPage, type LiveTrailSample } from "../../convex/tripcastApi";
import { log } from "../../debug/debugLogger";
import { LIVE_TRAIL_CACHE_RECENT_LIMIT, LiveTrailCacheStore, type LiveTrailCachePersistence } from "./liveTrailCache";
import {
  LIVE_TRAIL_BACKFILL_LIMIT,
  LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
  liveTrailBackfillStartAt,
  useLiveTrailBackfill,
  type LiveTrailBackfillOptions,
} from "./useLiveTrailBackfill";

const query = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({
  useConvex: () => ({ query }),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("../../debug/debugLogger", () => ({ log: vi.fn() }));

const NOW = Date.UTC(2026, 10, 15, 16, 11, 18);
const persistence: LiveTrailCachePersistence = { read: async () => undefined, write: async () => {}, remove: async () => {} };
const sample = (index: number, sampledAt = NOW - (10 - index) * 10_000): LiveTrailSample =>
  ({ _id: `sample-${index}`, lat: 47.6 + index / 1_000, lon: -122.3, sampledAt });
const page = (rows: LiveTrailSample[], hasMore = false): LiveTrailReplayPage => ({
  page: [...rows].sort((a, b) => b.sampledAt - a.sampledAt),
  hasMore,
  reachedTrueEnd: !hasMore,
  continueCursor: "done",
  effectiveStartAt: null,
  effectiveEndAt: null,
  scanBoundaryAt: null,
});
const ids = (cache: LiveTrailCacheStore) => cache.snapshot().samples.map((row) => row._id);
const backfillLogs = () => vi.mocked(log).mock.calls.filter(([, , action]) => action === "live-trail:backfill");

async function hydratedCache(...rows: LiveTrailSample[]) {
  const cache = new LiveTrailCacheStore(Promise.resolve(`cache-${Math.random()}`), persistence, 1);
  await cache.hydrate();
  for (const row of rows) cache.addRecent(row);
  return cache;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

let visibility: DocumentVisibilityState = "visible";
async function returnToForeground() {
  visibility = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  visibility = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  await act(async () => {});
}

function renderBackfill(options: Partial<LiveTrailBackfillOptions> & { cache: LiveTrailCacheStore }) {
  const initial: LiveTrailBackfillOptions = {
    token: "token",
    tripId: "trip-autumn",
    latestSample: sample(9),
    active: true,
    ...options,
  };
  return renderHook((props: LiveTrailBackfillOptions) => useLiveTrailBackfill(props), { initialProps: initial });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  query.mockReset();
  vi.mocked(log).mockClear();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("liveTrailBackfillStartAt", () => {
  it("looks back 6 hours, or from the oldest recent sample once the recent pool is full", () => {
    expect(liveTrailBackfillStartAt([sample(1)], NOW)).toBe(NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS);
    const full = Array.from({ length: LIVE_TRAIL_CACHE_RECENT_LIMIT }, (_, index) => sample(index, NOW - 3_600_000 + index));
    expect(liveTrailBackfillStartAt(full, NOW)).toBe(NOW - 3_600_000);
    const stale = full.map((row) => ({ ...row, sampledAt: row.sampledAt - 24 * 3_600_000 }));
    expect(liveTrailBackfillStartAt(stale, NOW)).toBe(NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS);
  });
});

describe("useLiveTrailBackfill", () => {
  it("fills a batch gap on load: the stored samples between two cached ones join in time order, once each", async () => {
    const cache = await hydratedCache(sample(1), sample(5));
    query.mockResolvedValue(page([1, 2, 3, 4, 5].map((index) => sample(index))));
    renderBackfill({ cache, latestSample: sample(5) });
    await act(async () => {});

    expect(ids(cache)).toEqual([1, 2, 3, 4, 5].map((index) => `sample-${index}`));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(tripcastApi.liveTrail.listReplayLiveTrailSamples, {
      token: "token",
      tripId: "trip-autumn",
      paginationOpts: { numItems: LIVE_TRAIL_BACKFILL_LIMIT, cursor: null },
      startAt: NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
      direction: "desc",
    });
    expect(backfillLogs()).toEqual([["info", "LiveTrailBackfill", "live-trail:backfill", "map", {
      status: "ok",
      reason: "load",
      windowStartAt: NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
      windowMs: LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
      limit: LIVE_TRAIL_BACKFILL_LIMIT,
      fetched: 5,
      added: 3,
      cachedAfter: 5,
      truncated: false,
    }]]);
  });

  it("sends no trip id when none is given (Followers, multi-trip off), and waits for the cache to hydrate", async () => {
    const cache = new LiveTrailCacheStore(Promise.resolve("unhydrated"), persistence, 1);
    query.mockResolvedValue(page([sample(8)]));
    renderBackfill({ cache, tripId: null });
    await act(async () => {});
    expect(query).not.toHaveBeenCalled();

    await act(async () => {
      await cache.hydrate();
    });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).not.toHaveProperty("tripId");
    expect(ids(cache)).toEqual(["sample-8"]);
  });

  it("a return to the foreground fetches once; another return within 60 s does not", async () => {
    const cache = await hydratedCache(sample(1));
    query.mockResolvedValue(page([sample(1)]));
    renderBackfill({ cache });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);

    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 60_000);
    query.mockResolvedValue(page([sample(1), sample(2), sample(3)]));
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(2);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "ok", reason: "foreground", added: 2 });

    vi.setSystemTime(NOW + 119_000);
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(2);
    expect(ids(cache)).toEqual(["sample-1", "sample-2", "sample-3"]);
  });

  it("does not fetch offline, while inactive (Replay, live trail off or hidden), or with nothing stored in the window", async () => {
    const cache = await hydratedCache(sample(1));
    query.mockResolvedValue(page([sample(1), sample(2)]));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    const view = renderBackfill({ cache });
    await act(async () => {});
    vi.setSystemTime(NOW + 60_000);
    await returnToForeground();
    expect(query).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const props = { token: "token", cache, tripId: "trip-autumn", latestSample: sample(9), active: false };
    view.rerender(props);
    await returnToForeground();
    // A trip whose newest stored sample is older than the window, or none at all, has nothing missing.
    view.rerender({ ...props, active: true, latestSample: sample(9, NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS - 1) });
    await returnToForeground();
    view.rerender({ ...props, active: true, latestSample: null });
    await returnToForeground();
    expect(query).not.toHaveBeenCalled();
    expect(ids(cache)).toEqual(["sample-1"]);
  });

  it("drops a result that arrives after a trip switch or a clear: no other trip's samples enter a cache", async () => {
    const autumn = await hydratedCache(sample(1));
    const summer = await hydratedCache(sample(2));
    const answer = deferred<LiveTrailReplayPage>();
    query.mockReturnValue(answer.promise);
    const view = renderBackfill({ cache: autumn });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);

    view.rerender({ token: "token", cache: summer, tripId: "trip-summer", latestSample: sample(9), active: true });
    await act(async () => {
      answer.resolve(page([sample(1), sample(7), sample(8)]));
    });
    expect(ids(autumn)).toEqual(["sample-1"]);
    expect(ids(summer)).toEqual(["sample-2"]);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "dropped", reason: "load", fetched: 3 });

    // The same trip, cleared (Erase ALL Trips) while the fetch was in flight.
    vi.setSystemTime(NOW + 60_000);
    const cleared = deferred<LiveTrailReplayPage>();
    query.mockReturnValue(cleared.promise);
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(2);
    await act(async () => {
      await summer.clear();
      cleared.resolve(page([sample(2), sample(8)]));
    });
    expect(ids(summer)).toEqual([]);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "dropped", reason: "foreground" });
  });

  it("a failed fetch leaves the cache as it was, logs once without coordinates, and never throws", async () => {
    const cache = await hydratedCache(sample(1), sample(5));
    query.mockRejectedValue(Object.assign(new Error("trip_not_found"), { data: { code: "trip_not_found" } }));
    const view = renderBackfill({ cache });
    await act(async () => {});

    expect(view.result.current).toBeUndefined();
    expect(ids(cache)).toEqual(["sample-1", "sample-5"]);
    const logs = backfillLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toBe("error");
    expect(logs[0][4]).toEqual({
      status: "failed",
      reason: "load",
      windowStartAt: NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
      windowMs: LIVE_TRAIL_BACKFILL_LOOKBACK_MS,
      limit: LIVE_TRAIL_BACKFILL_LIMIT,
      errorType: "Error",
      code: "trip_not_found",
    });
  });

  it("keeps the cache within its size limit: a full recent pool asks from its oldest sample and stays at 100", async () => {
    const recent = Array.from({ length: LIVE_TRAIL_CACHE_RECENT_LIMIT }, (_, index) => sample(index, NOW - 200_000 + index * 2_000));
    const cache = await hydratedCache(...recent);
    // The server holds a sample in every gap: the newest 100 come back, newest first.
    const stored = Array.from({ length: 200 }, (_, index) => sample(1_000 + index, NOW - 200_000 + index * 1_000 + 1));
    query.mockResolvedValue(page(stored.slice(-LIVE_TRAIL_BACKFILL_LIMIT), true));
    renderBackfill({ cache });
    await act(async () => {});

    expect(query.mock.calls[0][1]).toMatchObject({ startAt: recent[0].sampledAt });
    const snapshot = cache.snapshot();
    expect(snapshot.recent).toHaveLength(LIVE_TRAIL_CACHE_RECENT_LIMIT);
    expect(snapshot.samples).toHaveLength(LIVE_TRAIL_CACHE_RECENT_LIMIT);
    expect(snapshot.samples.map((row) => row.sampledAt)).toEqual([...snapshot.samples.map((row) => row.sampledAt)].sort((a, b) => a - b));
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "ok", fetched: 100, cachedAfter: 100, truncated: true });
  });
});
