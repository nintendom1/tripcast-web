import { useCallback, useEffect, useRef } from "react";

import { tripcastApi, type LiveTrailSample } from "../../convex/tripcastApi";
import { useTripConvex, type TripConvexClient } from "../../convex/useTrip";
import { log as debugLog } from "../../debug/debugLogger";
import { tripErrorInfo } from "../trips/tripSwitchState";
import { LIVE_TRAIL_CACHE_RECENT_LIMIT, type LiveTrailCacheStore } from "./liveTrailCache";

/**
 * Samples per backfill: one page of at most the recent pool's size. The pool keeps only its newest 100, so a larger page
 * would read samples the cache drops at once.
 */
export const LIVE_TRAIL_BACKFILL_LIMIT = LIVE_TRAIL_CACHE_RECENT_LIMIT;
/** How far back a backfill looks: the server's Follower live window (`FOLLOWER_RECENT_MS` in the backend's liveTrail.ts). */
export const LIVE_TRAIL_BACKFILL_LOOKBACK_MS = 6 * 60 * 60 * 1000;
export const LIVE_TRAIL_BACKFILL_MIN_INTERVAL_MS = 60_000;

export type LiveTrailBackfillReason = "load" | "foreground";

const SRC = "LiveTrailBackfill";

/**
 * The oldest time a backfill asks for. The live cache adds only the newest sample of each server update, so the missing
 * points of an upload batch are OLDER than the newest cached one: the window starts at the lookback, or at the oldest
 * recent sample once the pool is full (anything older would be dropped by the pool limit, so it cannot be missing).
 */
export function liveTrailBackfillStartAt(recent: readonly LiveTrailSample[], now: number) {
  const lookbackStart = now - LIVE_TRAIL_BACKFILL_LOOKBACK_MS;
  if (recent.length < LIVE_TRAIL_CACHE_RECENT_LIMIT) return lookbackStart;
  return Math.max(lookbackStart, recent[0].sampledAt);
}

export type LiveTrailBackfillOptions = {
  token: string;
  /** The viewed trip's cache (`getLiveTrailCache`): a result is merged only into the store it was fetched for. */
  cache: LiveTrailCacheStore;
  /** The trip to read, sent explicitly (a Traveler's shared trip); `null` sends today's untagged request (Followers). */
  tripId: string | null;
  /** The newest stored sample from the existing latest-sample subscription: `undefined` while it loads. */
  latestSample: { sampledAt: number } | null | undefined;
  /** The live map draws the live trail for this role: not in Replay, live trail on and visible. */
  active: boolean;
};

/**
 * Fills the live trail with the stored samples the cache missed: once when the map loads a trip's cache, and on each
 * return to the foreground. One one-shot page (no subscription), at most once per 60 s, never offline or inactive, and
 * skipped when the newest stored sample is older than the window (nothing in it can be missing). A result is dropped if
 * the trip, the cache or `active` changed, or the cache was cleared, while it was in flight; a failure is logged only.
 */
export function useLiveTrailBackfill({ token, cache, tripId, latestSample, active }: LiveTrailBackfillOptions) {
  const client = useTripConvex();
  const latest = useRef({ token, cache, tripId, latestSample, active, client });
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(Number.NEGATIVE_INFINITY);
  const loadedRef = useRef(new WeakSet<LiveTrailCacheStore>());

  useEffect(() => {
    latest.current = { token, cache, tripId, latestSample, active, client };
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const backfill = useCallback(async (reason: LiveTrailBackfillReason) => {
    const { token, cache, tripId, latestSample, active } = latest.current;
    const client: TripConvexClient = latest.current.client;
    if (!active || inFlightRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const snapshot = cache.snapshot();
    if (!snapshot.hydrated) return;
    const now = Date.now();
    if (now - lastFetchAtRef.current < LIVE_TRAIL_BACKFILL_MIN_INTERVAL_MS) return;
    const startAt = liveTrailBackfillStartAt(snapshot.recent, now);
    if (!latestSample || latestSample.sampledAt < startAt) return;

    lastFetchAtRef.current = now;
    inFlightRef.current = true;
    const revision = cache.clearRevision;
    const window = { windowStartAt: startAt, windowMs: now - startAt, limit: LIVE_TRAIL_BACKFILL_LIMIT };
    try {
      const result = await client.query(tripcastApi.liveTrail.listReplayLiveTrailSamples, {
        token,
        paginationOpts: { numItems: LIVE_TRAIL_BACKFILL_LIMIT, cursor: null },
        startAt,
        direction: "desc",
        ...(tripId ? { tripId } : {}),
      });
      const current = latest.current;
      const fetched = result.page.length;
      if (
        !mountedRef.current
        || !current.active
        || current.cache !== cache
        || current.tripId !== tripId
        || cache.clearRevision !== revision
      ) {
        debugLog("info", SRC, "live-trail:backfill", "map", { status: "dropped", reason, ...window, fetched });
        return;
      }
      const added = cache.mergeRecent(result.page);
      debugLog("info", SRC, "live-trail:backfill", "map", {
        status: "ok",
        reason,
        ...window,
        fetched,
        added,
        cachedAfter: cache.snapshot().samples.length,
        truncated: result.hasMore,
      });
    } catch (error) {
      debugLog("error", SRC, "live-trail:backfill", "map", {
        status: "failed",
        reason,
        ...window,
        errorType: error instanceof Error ? error.name : typeof error,
        code: tripErrorInfo(error).code,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Load: once per trip cache, after it hydrated (the window comes from it) and the latest sample loaded.
  const latestLoaded = latestSample !== undefined;
  useEffect(() => {
    if (!active || !latestLoaded || loadedRef.current.has(cache)) return;
    const attempt = () => {
      if (loadedRef.current.has(cache) || !cache.snapshot().hydrated) return;
      loadedRef.current.add(cache);
      void backfill("load");
    };
    attempt();
    return cache.subscribe(attempt);
  }, [active, backfill, cache, latestLoaded]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void backfill("foreground");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [backfill]);
}
