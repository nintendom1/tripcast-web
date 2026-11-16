import type { NativeRouteBlock, NativeRoutePoint, RouteRequest } from "../../native/nativeLocationManager";

/**
 * The Traveler's own live map draws the route record the phone keeps (`getLocalTrailSnapshot({ route })`), not more
 * server reads. Pure helpers: the record the map holds, the day window and the merged path.
 */

type TrailPoint = { lat: number; lon: number; sampledAt: number };

/**
 * The window reaches back to local midnight, or 6 hours when that is earlier, so the route does not vanish at midnight.
 * A whole day is affordable here only because it comes from the phone's record, which costs no Convex reads. Measured on
 * the owner's trail data (2026-11-15): 100 points are about 11 minutes of movement, and the busiest days had 1,600 to
 * 2,300 points. Followers stay at about 100 server points: server reads cost Convex Database I/O and multiply per
 * Follower.
 */
export const ROUTE_WINDOW_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/**
 * The Traveler's path never draws fewer than today's newest 100 points (about 11 minutes of movement), so the morning
 * still shows yesterday's tail as it did before the record. 100 is also what Followers get from the server, where every
 * extra point is Convex Database I/O per Follower; the phone's record costs none.
 */
export const TRAVELER_PATH_MIN_POINTS = 100;

/** The phone's record for one trip as the map holds it. `generation` is `null` until a block was received. */
export type RouteRecordState = {
  tripId: string | null;
  generation: string | null;
  lastSeq: number | null;
  /** Oldest first, by `seq`. */
  points: readonly NativeRoutePoint[];
};

/** What a block did: `trip-mismatch` (asked for another trip) and `stale` (a delta for another generation) are dropped. */
export type RouteSyncResult = "applied" | "unchanged" | "replaced" | "trip-mismatch" | "stale";

export function emptyRouteRecord(tripId: string | null): RouteRecordState {
  return { tripId, generation: null, lastSeq: null, points: [] };
}

/** The request that asks native only for what `state` does not hold yet. */
export function routeRequestOf(state: RouteRecordState): RouteRequest {
  return { tripId: state.tripId, sinceSeq: state.lastSeq, generation: state.generation };
}

/**
 * Applies one block from native. A block for a trip the map no longer shows is dropped. `replace` takes the trip's whole
 * record; a delta drops held points below `firstSeq` (pruned by age or cap) and appends the new ones. A delta continues
 * the generation it was asked with, so one for another generation answers an older request and is dropped: the next
 * request then gets a `replace`. An unchanged record returns `state` itself.
 */
export function applyRouteBlock(
  state: RouteRecordState,
  block: NativeRouteBlock,
): { state: RouteRecordState; result: RouteSyncResult } {
  if (block.tripId !== state.tripId) return { state, result: "trip-mismatch" };
  if (block.replace) {
    return {
      state: { tripId: state.tripId, generation: block.generation, lastSeq: block.lastSeq, points: block.points },
      result: "replaced",
    };
  }
  if (block.generation !== state.generation) return { state, result: "stale" };
  const since = state.lastSeq ?? Number.NEGATIVE_INFINITY;
  const kept = state.points.filter((point) => point.seq >= block.firstSeq);
  const added = block.points.filter((point) => point.seq > since);
  if (added.length === 0 && kept.length === state.points.length && block.lastSeq === state.lastSeq) {
    return { state, result: "unchanged" };
  }
  return { state: { ...state, lastSeq: block.lastSeq, points: [...kept, ...added] }, result: "applied" };
}

/** The earlier of local midnight today and `now` minus 6 hours, in the phone's time zone. */
export function routeWindowStart(now: number): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Math.min(midnight.getTime(), now - ROUTE_WINDOW_LOOKBACK_MS);
}

/**
 * Today's duplicate key: the same time and position. `null` when a field is NaN: the previous `findIndex` comparison
 * never matched such a row, not even with itself, so it was dropped.
 */
function trailKey(row: TrailPoint): string | null {
  if (Number.isNaN(row.sampledAt) || Number.isNaN(row.lat) || Number.isNaN(row.lon)) return null;
  return `${row.sampledAt}:${row.lat}:${row.lon}`;
}

/**
 * The Traveler's path without a route record (a browser, or an iOS build without it): exactly the previous builder.
 * Cache rows and the device's acknowledged points, deduplicated first-wins, in time order, the newest 100.
 */
export function buildFallbackTravelerPathSamples<A extends TrailPoint, B extends TrailPoint>(
  base: readonly A[],
  acknowledged: readonly B[],
  inWindow: (sampledAt: number) => boolean,
): Array<A | B> {
  const seen = new Set<string>();
  const rows: Array<A | B> = [];
  for (const row of [...base, ...acknowledged]) {
    if (!inWindow(row.sampledAt)) continue;
    const key = trailKey(row);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.sort((a, b) => a.sampledAt - b.sampledAt).slice(-TRAVELER_PATH_MIN_POINTS);
}

/** Counts for `map:route-record:render` (never coordinates). */
export type TravelerPathStats = {
  recordInWindow: number;
  cacheInWindow: number;
  pendingExcluded: number;
  duplicates: number;
  drawnCount: number;
  cut: "window" | "newest-100";
  windowHours: number;
};

/**
 * The Traveler's path with a route record: the cache rows plus the record's entries that are not pending (the pending
 * overlay draws those), deduplicated with the cache row winning, in time order, from the earlier of the window start
 * and the 100th-newest point. Record entries before `cutoffAt` are left out like the cache rows already are.
 */
export function buildTravelerPathSamples<T extends TrailPoint>({
  cacheRows,
  record,
  pendingIds,
  cutoffAt = null,
  now,
}: {
  cacheRows: readonly T[];
  record: readonly NativeRoutePoint[];
  pendingIds: ReadonlySet<string>;
  cutoffAt?: number | null;
  now: number;
}): { samples: Array<T | NativeRoutePoint>; stats: TravelerPathStats } {
  const seen = new Set<string>();
  const fromRecord = new Set<NativeRoutePoint>();
  const rows: Array<T | NativeRoutePoint> = [];
  let duplicates = 0;
  let pendingExcluded = 0;
  const add = (row: T | NativeRoutePoint) => {
    const key = trailKey(row);
    if (key === null) return false;
    if (seen.has(key)) {
      duplicates += 1;
      return false;
    }
    seen.add(key);
    rows.push(row);
    return true;
  };
  for (const row of cacheRows) add(row);
  for (const point of record) {
    if (pendingIds.has(point.clientSampleId)) {
      pendingExcluded += 1;
      continue;
    }
    if (cutoffAt !== null && point.sampledAt < cutoffAt) continue;
    if (add(point)) fromRecord.add(point);
  }
  rows.sort((a, b) => a.sampledAt - b.sampledAt);

  const windowStart = routeWindowStart(now);
  const firstInWindow = rows.findIndex((row) => row.sampledAt >= windowStart);
  const windowIndex = firstInWindow === -1 ? rows.length : firstInWindow;
  const minimumIndex = Math.max(0, rows.length - TRAVELER_PATH_MIN_POINTS);
  const samples = rows.slice(Math.min(windowIndex, minimumIndex));
  const recordInWindow = samples.reduce((count, row) => count + (fromRecord.has(row as NativeRoutePoint) ? 1 : 0), 0);
  return {
    samples,
    stats: {
      recordInWindow,
      cacheInWindow: samples.length - recordInWindow,
      pendingExcluded,
      duplicates,
      drawnCount: samples.length,
      cut: windowIndex < minimumIndex ? "window" : "newest-100",
      windowHours: Math.round((now - windowStart) / 360_000) / 10,
    },
  };
}
