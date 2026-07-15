import type { LiveTrailSample, Role } from "../../convex/tripcastApi";
import { log as debugLog } from "../../debug/debugLogger";

export const LIVE_TRAIL_CACHE_RECENT_LIMIT = 100;
export const LIVE_TRAIL_CACHE_TOTAL_LIMIT = 1_000;

const DB_NAME = "tripcast_live_trail_cache";
const STORE_NAME = "trailCaches";
const DB_VERSION = 1;
const RECORD_VERSION = 1;
const WRITE_DEBOUNCE_MS = 150;

export type LiveTrailCacheSnapshot = {
  recent: LiveTrailSample[];
  replay: LiveTrailSample[];
  samples: LiveTrailSample[];
  hydrated: boolean;
};

type CacheRecord = {
  id: string;
  version: number;
  recent: LiveTrailSample[];
  replay: LiveTrailSample[];
};

type CachePools = Pick<LiveTrailCacheSnapshot, "recent" | "replay" | "samples">;

export type LiveTrailCachePersistence = {
  read(identity: string): Promise<unknown>;
  write(record: CacheRecord): Promise<void>;
  remove(identity: string): Promise<void>;
};

const emptyPools = (): CachePools => ({ recent: [], replay: [], samples: [] });

export function validLiveTrailSample(value: unknown): value is LiveTrailSample {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LiveTrailSample>;
  return typeof row._id === "string" && row._id.length > 0
    && typeof row.lat === "number" && Number.isFinite(row.lat)
    && typeof row.lon === "number" && Number.isFinite(row.lon)
    && typeof row.sampledAt === "number" && Number.isFinite(row.sampledAt)
    && (row.accuracy === undefined
      || (typeof row.accuracy === "number" && Number.isFinite(row.accuracy)));
}

function newestUnique(rows: readonly unknown[], limit: number, excluded = new Set<string>()) {
  const byId = new Map<string, LiveTrailSample>();
  for (const value of rows) {
    if (!validLiveTrailSample(value) || excluded.has(value._id)) continue;
    const current = byId.get(value._id);
    if (!current || value.sampledAt >= current.sampledAt) byId.set(value._id, value);
  }
  return [...byId.values()]
    .sort((a, b) => b.sampledAt - a.sampledAt || b._id.localeCompare(a._id))
    .slice(0, limit)
    .sort((a, b) => a.sampledAt - b.sampledAt || a._id.localeCompare(b._id));
}

export function selectLiveTrailCachePools(
  recentRows: readonly unknown[],
  replayRows: readonly unknown[],
): CachePools {
  const recent = newestUnique(recentRows, LIVE_TRAIL_CACHE_RECENT_LIMIT);
  const recentIds = new Set(recent.map((sample) => sample._id));
  const replay = newestUnique(
    replayRows,
    LIVE_TRAIL_CACHE_TOTAL_LIMIT - recent.length,
    recentIds,
  );
  return {
    recent,
    replay,
    samples: [...recent, ...replay]
      .sort((a, b) => a.sampledAt - b.sampledAt || a._id.localeCompare(b._id)),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export const indexedDbLiveTrailCachePersistence: LiveTrailCachePersistence = {
  async read(identity) {
    const database = await openDatabase();
    const rows = await requestResult(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
    );
    return rows.find((row) => (row as Partial<CacheRecord>)?.id === identity);
  },
  async write(record) {
    const database = await openDatabase();
    await requestResult(
      database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record),
    );
  },
  async remove(identity) {
    const database = await openDatabase();
    await requestResult(
      database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(identity),
    );
  },
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintLiveTrailCacheIdentity(token: string, role: Role) {
  return sha256(`${role}\u0000${token}`);
}

export class LiveTrailCacheStore {
  private pools = emptyPools();
  private hydrated = false;
  private listeners = new Set<() => void>();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private writeQueued = false;
  private operation = Promise.resolve();
  private revision = 0;

  constructor(
    private readonly identity: Promise<string>,
    private readonly persistence: LiveTrailCachePersistence = indexedDbLiveTrailCachePersistence,
    private readonly debounceMs = WRITE_DEBOUNCE_MS,
  ) {}

  snapshot(): LiveTrailCacheSnapshot {
    return { ...this.pools, hydrated: this.hydrated };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  async hydrate() {
    const revision = this.revision;
    try {
      const identity = await this.identity;
      const value = await this.persistence.read(identity);
      if (revision !== this.revision) return this.snapshot();
      const record = value && typeof value === "object" ? value as Partial<CacheRecord> : null;
      let storedCount = 0;
      let acceptedStoredCount = 0;
      if (record?.version === RECORD_VERSION) {
        const storedRecent = Array.isArray(record.recent) ? record.recent : [];
        const storedReplay = Array.isArray(record.replay) ? record.replay : [];
        storedCount = storedRecent.length + storedReplay.length;
        const storedPools = selectLiveTrailCachePools(storedRecent, storedReplay);
        acceptedStoredCount = storedPools.samples.length;
        this.pools = selectLiveTrailCachePools(
          [...storedPools.recent, ...this.pools.recent],
          this.pools.replay.length > 0 ? this.pools.replay : storedPools.replay,
        );
      }
      this.hydrated = true;
      this.emit();
      debugLog("info", "LiveTrailCache", "cache:hydrate", "state", {
        status: "ok",
        recentCount: this.pools.recent.length,
        replayCount: this.pools.replay.length,
        uniqueCount: this.pools.samples.length,
        storedCount,
        acceptedStoredCount,
        droppedStoredCount: storedCount - acceptedStoredCount,
      });
    } catch {
      if (revision !== this.revision) return this.snapshot();
      this.hydrated = true;
      this.emit();
      debugLog("error", "LiveTrailCache", "cache:hydrate", "state", {
        status: "failed",
        sampleCount: this.pools.samples.length,
      });
    }
    return this.snapshot();
  }

  addRecent(sample: unknown) {
    if (!validLiveTrailSample(sample)) return;
    this.pools = selectLiveTrailCachePools([...this.pools.recent, sample], this.pools.replay);
    this.emit();
    this.scheduleWrite();
  }

  replaceReplay(samples: readonly unknown[]) {
    this.pools = selectLiveTrailCachePools(this.pools.recent, samples);
    this.emit();
    this.scheduleWrite();
  }

  removeIds(ids: Iterable<string>) {
    const removed = new Set(ids);
    if (removed.size === 0) return;
    this.pools = selectLiveTrailCachePools(
      this.pools.recent.filter((sample) => !removed.has(sample._id)),
      this.pools.replay.filter((sample) => !removed.has(sample._id)),
    );
    this.emit();
    this.scheduleWrite();
  }

  removeRange(startAt: number, endExclusiveAt: number) {
    const keep = (sample: LiveTrailSample) => sample.sampledAt < startAt || sample.sampledAt >= endExclusiveAt;
    this.pools = selectLiveTrailCachePools(this.pools.recent.filter(keep), this.pools.replay.filter(keep));
    this.emit();
    this.scheduleWrite();
  }

  pruneBefore(cutoffAt: number) {
    const keep = (sample: LiveTrailSample) => sample.sampledAt >= cutoffAt;
    this.pools = selectLiveTrailCachePools(this.pools.recent.filter(keep), this.pools.replay.filter(keep));
    this.emit();
    this.scheduleWrite();
  }

  async clear() {
    this.revision += 1;
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.writeQueued = false;
    this.pools = emptyPools();
    this.hydrated = true;
    this.emit();
    try {
      await this.operation;
      const identity = await this.identity;
      await this.persistence.remove(identity);
      debugLog("info", "LiveTrailCache", "cache:clear", "state", {
        status: "ok",
        recentCount: 0,
        replayCount: 0,
        uniqueCount: 0,
      });
    } catch {
      debugLog("error", "LiveTrailCache", "cache:clear", "state", { status: "failed", sampleCount: 0 });
    }
  }

  private scheduleWrite() {
    this.writeQueued = true;
    if (this.writeTimer !== null) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush("debounce");
    }, this.debounceMs);
  }

  async flush(reason: "debounce" | "replay-exit" | "manual" = "manual") {
    if (!this.writeQueued) {
      debugLog("info", "LiveTrailCache", "cache:flush", "state", {
        status: "noop",
        reason,
        recentCount: this.pools.recent.length,
        replayCount: this.pools.replay.length,
        uniqueCount: this.pools.samples.length,
      });
      return this.operation;
    }
    this.writeQueued = false;
    const pools = this.pools;
    this.operation = this.operation.then(async () => {
      try {
        const identity = await this.identity;
        await this.persistence.write({ id: identity, version: RECORD_VERSION, recent: pools.recent, replay: pools.replay });
        debugLog("info", "LiveTrailCache", "cache:write", "state", {
          status: "ok",
          reason,
          recentCount: pools.recent.length,
          replayCount: pools.replay.length,
          uniqueCount: pools.samples.length,
        });
        debugLog("info", "LiveTrailCache", "cache:flush", "state", {
          status: "ok",
          reason,
          recentCount: pools.recent.length,
          replayCount: pools.replay.length,
          uniqueCount: pools.samples.length,
        });
      } catch {
        debugLog("error", "LiveTrailCache", "cache:write", "state", {
          status: "failed",
          reason,
          sampleCount: pools.samples.length,
        });
        debugLog("error", "LiveTrailCache", "cache:flush", "state", {
          status: "failed",
          reason,
          sampleCount: pools.samples.length,
        });
      }
    });
    return this.operation;
  }
}

const stores = new Map<string, LiveTrailCacheStore>();
const allStores = new Set<LiveTrailCacheStore>();

function runtimeKey(token: string, role: Role) {
  return `${role}\u0000${token}`;
}

export function getLiveTrailCache(token: string, role: Role) {
  const key = runtimeKey(token, role);
  let store = stores.get(key);
  if (!store) {
    store = new LiveTrailCacheStore(fingerprintLiveTrailCacheIdentity(token, role));
    stores.set(key, store);
    allStores.add(store);
  }
  return store;
}

export async function clearLiveTrailCache(token: string, role: Role) {
  const key = runtimeKey(token, role);
  const store = stores.get(key) ?? new LiveTrailCacheStore(fingerprintLiveTrailCacheIdentity(token, role));
  allStores.add(store);
  stores.delete(key);
  await store.clear();
}

export async function clearLiveTrailCachesForToken(token: string) {
  await Promise.all([
    clearLiveTrailCache(token, "traveler"),
    clearLiveTrailCache(token, "follower"),
  ]);
}

export function dropLiveTrailCacheRuntimeForTests(token: string, role: Role) {
  stores.delete(runtimeKey(token, role));
}

export async function resetLiveTrailCachesForTests() {
  await Promise.all([...allStores].map((store) => store.clear()));
  stores.clear();
  allStores.clear();
}
