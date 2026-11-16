import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi, type LiveTrailReplayPage, type LiveTrailSample } from "../../convex/tripcastApi";
import { log } from "../../debug/debugLogger";
import {
  LIVE_TRAIL_CACHE_RECENT_LIMIT,
  LIVE_TRAIL_CACHE_TOTAL_LIMIT,
  LiveTrailCacheStore,
  type LiveTrailCachePersistence,
} from "./liveTrailCache";
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

  it("a hold keeps the load and a foreground return until it ends: they run if the hook is then active, are dropped if not", async () => {
    const props = (cache: LiveTrailCacheStore, active: boolean, hold: boolean): LiveTrailBackfillOptions =>
      ({ token: "token", cache, tripId: "trip-autumn", latestSample: sample(9), active, hold });
    query.mockResolvedValue(page([sample(1), sample(2)]));

    // The load waits for the hold.
    const fresh = await hydratedCache(sample(1));
    const loading = renderBackfill({ cache: fresh, hold: true });
    await act(async () => {});
    expect(query).not.toHaveBeenCalled();
    loading.rerender(props(fresh, true, false));
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ reason: "load" });

    // Two returns during a hold: one foreground fetch once it ends.
    loading.rerender(props(fresh, true, true));
    vi.setSystemTime(NOW + 61_000);
    await returnToForeground();
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(1);
    loading.rerender(props(fresh, true, false));
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(2);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ reason: "foreground" });

    // Inactive when the hold ends (the phone's record covers the trip): nothing, and nothing later either.
    loading.rerender(props(fresh, true, true));
    vi.setSystemTime(NOW + 130_000);
    await returnToForeground();
    loading.rerender(props(fresh, false, false));
    await act(async () => {});
    loading.rerender(props(fresh, true, false));
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(2);
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
    const autumnAnswer = deferred<LiveTrailReplayPage>();
    const summerAnswer = deferred<LiveTrailReplayPage>();
    query.mockReturnValueOnce(autumnAnswer.promise).mockReturnValueOnce(summerAnswer.promise);
    const view = renderBackfill({ cache: autumn });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);

    // The new trip's cache has its own 60 s limit and load: it loads at once, with its own trip id.
    view.rerender({ token: "token", cache: summer, tripId: "trip-summer", latestSample: sample(9), active: true });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toMatchObject({ tripId: "trip-summer" });
    await act(async () => {
      autumnAnswer.resolve(page([sample(1), sample(7), sample(8)]));
    });
    expect(ids(autumn)).toEqual(["sample-1"]);
    expect(ids(summer)).toEqual(["sample-2"]);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "dropped", reason: "load", fetched: 3 });

    // The new trip's cache, cleared (Erase ALL Trips) while its fetch was in flight.
    await act(async () => {
      await summer.clear();
      summerAnswer.resolve(page([sample(2), sample(8)]));
    });
    expect(ids(summer)).toEqual([]);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "dropped", reason: "load", fetched: 2 });
  });

  it("drops a result fetched under a Follower cutoff that changed while it was in flight", async () => {
    const cache = await hydratedCache(sample(5));
    const answer = deferred<LiveTrailReplayPage>();
    query.mockReturnValueOnce(answer.promise);
    const props: LiveTrailBackfillOptions = {
      token: "token", cache, tripId: null, latestSample: sample(9), cutoffAt: NOW - 100_000, active: true,
    };
    const view = renderHook((options: LiveTrailBackfillOptions) => useLiveTrailBackfill(options), { initialProps: props });
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);

    // The Traveler raises the cutoff: the cache is pruned to it, and the answer (fetched under the old one) is dropped.
    view.rerender({ ...props, cutoffAt: sample(4).sampledAt });
    await act(async () => {
      answer.resolve(page([1, 2, 3, 4, 5].map((index) => sample(index))));
    });
    expect(ids(cache)).toEqual(["sample-5"]);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "dropped", reason: "load", fetched: 5 });
  });

  it("a remount neither loads nor fetches again within 60 s: the limit and the load mark belong to the cache", async () => {
    const cache = await hydratedCache(sample(1));
    query.mockResolvedValue(page([sample(1)]));
    renderBackfill({ cache }).unmount();
    await act(async () => {});
    expect(query).toHaveBeenCalledTimes(1);

    renderBackfill({ cache });
    await act(async () => {});
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 60_000);
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("after a complete backfill the next window starts at its newest sample; after a truncated one or a clear, in full", async () => {
    const cache = await hydratedCache(sample(1));
    const props: LiveTrailBackfillOptions = { token: "token", cache, tripId: "trip-autumn", latestSample: sample(4), active: true };
    query.mockResolvedValueOnce(page([sample(1), sample(2), sample(4)]));
    const view = renderHook((options: LiveTrailBackfillOptions) => useLiveTrailBackfill(options), { initialProps: props });
    await act(async () => {});
    expect(query.mock.calls[0][1]).toMatchObject({ startAt: NOW - LIVE_TRAIL_BACKFILL_LOOKBACK_MS });

    // Nothing stored after that backfill's newest sample: nothing can be missing, so nothing is read.
    vi.setSystemTime(NOW + 60_000);
    await returnToForeground();
    expect(query).toHaveBeenCalledTimes(1);
    view.rerender({ ...props, latestSample: sample(6) });
    query.mockResolvedValueOnce(page([sample(4), sample(5), sample(6)], true));
    await returnToForeground();
    expect(query.mock.calls[1][1]).toMatchObject({ startAt: sample(4).sampledAt });

    // That one was truncated: the next window is the full one again.
    vi.setSystemTime(NOW + 120_000);
    view.rerender({ ...props, latestSample: sample(7) });
    query.mockResolvedValueOnce(page([sample(7)]));
    await returnToForeground();
    expect(query.mock.calls[2][1]).toMatchObject({ startAt: NOW + 120_000 - LIVE_TRAIL_BACKFILL_LOOKBACK_MS });

    // A clear (Erase ALL Trips) also restores the full window.
    await act(async () => {
      await cache.clear();
    });
    vi.setSystemTime(NOW + 180_000);
    query.mockResolvedValueOnce(page([sample(7)]));
    await returnToForeground();
    expect(query.mock.calls[3][1]).toMatchObject({ startAt: NOW + 180_000 - LIVE_TRAIL_BACKFILL_LOOKBACK_MS });
    expect(ids(cache)).toEqual(["sample-7"]);
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

  it("a backfill into a full pool keeps exactly the newest 100 of cached and fetched, in time order; replay is untouched", async () => {
    // A Follower's pool after an hour open: 100 points, one per 30 s upload, from 50 min ago, and an older Replay stretch.
    const recent = Array.from({ length: LIVE_TRAIL_CACHE_RECENT_LIMIT }, (_, index) => sample(index, NOW - 3_000_000 + index * 30_000));
    const replay = Array.from({ length: 20 }, (_, index) => sample(500 + index, NOW - 4_000_000 + index * 30_000));
    const cache = await hydratedCache(...recent);
    cache.replaceReplay(replay);
    // The server holds a point every 8 s: the newest 100 (the last 13 min) come back, newest first.
    const dense = Array.from({ length: LIVE_TRAIL_BACKFILL_LIMIT }, (_, index) => sample(1_000 + index, NOW - 800_000 + index * 8_000 + 3));
    query.mockResolvedValue(page(dense, true));
    renderBackfill({ cache });
    await act(async () => {});

    expect(query.mock.calls[0][1]).toMatchObject({ startAt: recent[0].sampledAt });
    const newest100 = [...recent, ...dense].sort((a, b) => a.sampledAt - b.sampledAt).slice(-LIVE_TRAIL_CACHE_RECENT_LIMIT);
    const snapshot = cache.snapshot();
    // The older, sparse points drop off: the drawn span is shorter, which the owner accepted.
    expect(snapshot.recent.map((row) => row._id)).toEqual(newest100.map((row) => row._id));
    expect(new Set(snapshot.samples.map((row) => row._id)).size).toBe(snapshot.samples.length);
    expect(snapshot.samples.map((row) => row.sampledAt)).toEqual([...snapshot.samples.map((row) => row.sampledAt)].sort((a, b) => a - b));
    expect(snapshot.replay).toEqual(replay);
    expect(snapshot.samples.length).toBeLessThanOrEqual(LIVE_TRAIL_CACHE_TOTAL_LIMIT);
    expect(backfillLogs().at(-1)?.[4]).toMatchObject({ status: "ok", fetched: 100, cachedAfter: 120, truncated: true });
  });
});
