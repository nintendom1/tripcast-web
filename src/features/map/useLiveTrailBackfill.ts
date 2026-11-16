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
  /** The Follower content cutoff the cache is pruned to (`undefined` for a Traveler): a result fetched under another is dropped. */
  cutoffAt?: number | null;
  /** The live map draws the live trail for this role: not in Replay, live trail on and visible. */
  active: boolean;
  /**
   * A cheaper source is still being asked (the Traveler's phone record): no backfill starts, and the load and a foreground
   * return that arrive meanwhile are kept. When `hold` ends with `active` still true they run (the foreground one once);
   * when `active` is false by then they are dropped.
   */
  hold?: boolean;
};

/** Backfill state of one trip cache, kept outside any component so a remount neither fetches again at once nor reloads. */
type StoreState = {
  /** When the last fetch for this cache started: the 60 s limit. */
  lastFetchAt: number;
  /** The load backfill was attempted. */
  loaded: boolean;
  inFlight: boolean;
  /** The newest sample of the last complete (not truncated) backfill: nothing older can be missing, so the next window may
   * start there. Valid only for the clear revision and cutoff it was fetched under. */
  resume: { at: number; revision: number; cutoffAt: number | null | undefined } | null;
};

const storeStates = new WeakMap<LiveTrailCacheStore, StoreState>();

function stateOf(cache: LiveTrailCacheStore) {
  let state = storeStates.get(cache);
  if (!state) {
    state = { lastFetchAt: Number.NEGATIVE_INFINITY, loaded: false, inFlight: false, resume: null };
    storeStates.set(cache, state);
  }
  return state;
}

/**
 * Fills the live trail with the stored samples the cache missed: once when the map loads a trip's cache, and on each
 * return to the foreground. One one-shot page (no subscription), at most once per 60 s per cache, never offline or
 * inactive, and skipped when nothing is stored after the window start (or after the last complete backfill). A result is
 * dropped if the trip, the cache, the Follower cutoff or `active` changed, or the cache was cleared, while it was in
 * flight; a failure is logged only.
 */
export function useLiveTrailBackfill({ token, cache, tripId, latestSample, cutoffAt, active, hold = false }: LiveTrailBackfillOptions) {
  const client = useTripConvex();
  const latest = useRef({ token, cache, tripId, latestSample, cutoffAt, active, client, hold });
  const mountedRef = useRef(false);
  /** A foreground return arrived during the hold. */
  const foregroundHeldRef = useRef(false);

  useEffect(() => {
    latest.current = { token, cache, tripId, latestSample, cutoffAt, active, client, hold };
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const backfill = useCallback(async (reason: LiveTrailBackfillReason) => {
    const { token, cache, tripId, latestSample, cutoffAt, active } = latest.current;
    const client: TripConvexClient = latest.current.client;
    const state = stateOf(cache);
    if (!active || state.inFlight) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const snapshot = cache.snapshot();
    if (!snapshot.hydrated) return;
    const now = Date.now();
    if (now - state.lastFetchAt < LIVE_TRAIL_BACKFILL_MIN_INTERVAL_MS) return;
    const revision = cache.clearRevision;
    const resumeAt = state.resume && state.resume.revision === revision && state.resume.cutoffAt === cutoffAt
      ? state.resume.at
      : null;
    const startAt = Math.max(liveTrailBackfillStartAt(snapshot.recent, now), resumeAt ?? Number.NEGATIVE_INFINITY);
    if (!latestSample || latestSample.sampledAt < startAt || (resumeAt !== null && latestSample.sampledAt <= resumeAt)) return;

    state.lastFetchAt = now;
    state.inFlight = true;
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
        || current.cutoffAt !== cutoffAt
        || cache.clearRevision !== revision
      ) {
        debugLog("info", SRC, "live-trail:backfill", "map", { status: "dropped", reason, ...window, fetched });
        return;
      }
      const added = cache.mergeRecent(result.page);
      state.resume = result.hasMore
        ? null
        : { at: Math.max(startAt, ...result.page.map((sample) => sample.sampledAt)), revision, cutoffAt };
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
      state.inFlight = false;
    }
  }, []);

  // Load: once per trip cache, after it hydrated (the window comes from it) and the latest sample loaded.
  const latestLoaded = latestSample !== undefined;
  useEffect(() => {
    const state = stateOf(cache);
    if (!active || hold || !latestLoaded || state.loaded) return;
    const attempt = () => {
      if (state.loaded || !cache.snapshot().hydrated) return;
      state.loaded = true;
      void backfill("load");
    };
    attempt();
    return cache.subscribe(attempt);
  }, [active, backfill, cache, hold, latestLoaded]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (latest.current.hold) foregroundHeldRef.current = true;
      else void backfill("foreground");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [backfill]);

  // The hold ended: run the foreground return it kept (`backfill` itself drops it when `active` is false).
  useEffect(() => {
    if (hold || !foregroundHeldRef.current) return;
    foregroundHeldRef.current = false;
    void backfill("foreground");
  }, [backfill, hold]);
}
