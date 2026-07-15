import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LIVE_TRAIL_CACHE_RECENT_LIMIT,
  LIVE_TRAIL_CACHE_TOTAL_LIMIT,
  LiveTrailCacheStore,
  fingerprintLiveTrailCacheIdentity,
  indexedDbLiveTrailCachePersistence,
  selectLiveTrailCachePools,
  type LiveTrailCachePersistence,
} from "./liveTrailCache";

const sample = (index: number, overrides: Record<string, unknown> = {}) => ({
  _id: `sample-${index}`,
  lat: 47 + index / 10_000,
  lon: -122 - index / 10_000,
  sampledAt: index,
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("selectLiveTrailCachePools", () => {
  it("protects the newest 100 recent rows and fills all remaining slots from Replay", () => {
    const recent = Array.from({ length: 150 }, (_, index) => sample(index));
    const replay = Array.from({ length: 1_200 }, (_, index) => sample(index + 1_000));
    const result = selectLiveTrailCachePools(recent, replay);

    expect(result.recent).toHaveLength(LIVE_TRAIL_CACHE_RECENT_LIMIT);
    expect(result.recent[0]._id).toBe("sample-50");
    expect(result.replay).toHaveLength(900);
    expect(result.samples).toHaveLength(LIVE_TRAIL_CACHE_TOTAL_LIMIT);
    expect(result.samples.at(-1)?._id).toBe("sample-2199");
  });

  it("replaces Replay, deduplicates IDs, sorts chronologically, and rejects corrupt rows", () => {
    const result = selectLiveTrailCachePools(
      [sample(4), sample(2), sample(2, { sampledAt: 9 })],
      [sample(2), sample(3), sample(10, { lat: Number.NaN }), sample(11, { accuracy: Infinity }), { _id: 2 }],
    );

    expect(result.recent.map((row) => [row._id, row.sampledAt])).toEqual([
      ["sample-4", 4],
      ["sample-2", 9],
    ]);
    expect(result.replay.map((row) => row._id)).toEqual(["sample-3"]);
    expect(result.samples.map((row) => row.sampledAt)).toEqual([3, 4, 9]);
  });
});

describe("LiveTrailCacheStore", () => {
  it("hydrates from the dedicated IndexedDB record and isolates identities", async () => {
    const identity = `cache-test-${Date.now()}-${Math.random()}`;
    const first = new LiveTrailCacheStore(Promise.resolve(identity), indexedDbLiveTrailCachePersistence, 1);
    first.addRecent(sample(1));
    first.replaceReplay([sample(2)]);
    await first.flush();

    const hydrated = new LiveTrailCacheStore(Promise.resolve(identity), indexedDbLiveTrailCachePersistence, 1);
    await hydrated.hydrate();
    expect(hydrated.snapshot().samples.map((row) => row._id)).toEqual(["sample-1", "sample-2"]);

    const isolated = new LiveTrailCacheStore(Promise.resolve(`${identity}-other`), indexedDbLiveTrailCachePersistence, 1);
    await isolated.hydrate();
    expect(isolated.snapshot().samples).toEqual([]);
  });

  it("coalesces writes and keeps memory usable when persistence fails", async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockRejectedValue(new Error("quota"));
    const persistence: LiveTrailCachePersistence = {
      read: vi.fn().mockRejectedValue(new Error("blocked")),
      write,
      remove: vi.fn().mockRejectedValue(new Error("blocked")),
    };
    const store = new LiveTrailCacheStore(Promise.resolve("failure"), persistence, 20);

    await store.hydrate();
    store.addRecent(sample(1));
    store.addRecent(sample(2));
    store.addRecent(sample(3));
    expect(store.snapshot().samples).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(20);
    await store.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.snapshot().samples).toHaveLength(3);
  });

  it("clears, prunes, and removes IDs and timestamp ranges from both pools", async () => {
    const records = new Map<string, unknown>();
    const persistence: LiveTrailCachePersistence = {
      read: async (id) => records.get(id),
      write: async (record) => { records.set(record.id, record); },
      remove: async (id) => { records.delete(id); },
    };
    const store = new LiveTrailCacheStore(Promise.resolve("mutations"), persistence, 1);
    store.addRecent(sample(1));
    store.addRecent(sample(5));
    store.replaceReplay([sample(2), sample(3), sample(4)]);
    store.removeIds(["sample-3"]);
    store.removeRange(2, 4);
    store.pruneBefore(4);
    expect(store.snapshot().samples.map((row) => row._id)).toEqual(["sample-4", "sample-5"]);
    await store.flush();
    await store.clear();
    expect(store.snapshot().samples).toEqual([]);
    expect(records.size).toBe(0);
  });

  it("uses a SHA-256 role-scoped fingerprint without returning the token", async () => {
    const traveler = await fingerprintLiveTrailCacheIdentity("secret-session-token", "traveler");
    const follower = await fingerprintLiveTrailCacheIdentity("secret-session-token", "follower");
    expect(traveler).toMatch(/^[a-f0-9]{64}$/);
    expect(follower).toMatch(/^[a-f0-9]{64}$/);
    expect(traveler).not.toBe(follower);
    expect(traveler).not.toContain("secret-session-token");
  });
});
