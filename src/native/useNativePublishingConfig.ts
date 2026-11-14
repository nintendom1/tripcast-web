import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";

import { tripcastApi, type Role } from "../convex/tripcastApi";
import { useTripQuery } from "../convex/useTrip";
import { useDebugLogger } from "../debug/useDebugLogger";
import { useAdaptiveGpsEnabled } from "../lib/adaptiveGpsPreference";
import { useLiveGpsUploadIntervalSeconds } from "../lib/liveGpsUploadIntervalPreference";
import { getLiveSharingEnabled, setLiveSharingEnabled } from "../lib/liveSharingPreference";
import { clearLiveSnooze, readLiveSnooze } from "../lib/liveSnooze";
import { useStaleBreadcrumbAlertSeconds } from "../lib/staleBreadcrumbAlertPreference";
import { USAGE_GUARD, usageBytesPerUpload } from "../lib/usageWarning";
import { useTripContext } from "../providers/TripContextProvider";
import {
  configureNativeLocationPublishing,
  isAdaptiveLocationAvailable,
  retryNativeLocationTracking,
} from "./locationWatcher";
import {
  getNativePublishingRetryNonce,
  reportLiveSharingStopped,
  setNativePublishingReady,
  setNativePublishingTags,
  subscribeNativePublishingRetry,
  subscribeNativePublishingRevoked,
  type NativePublishingTags,
} from "./nativePublishingSignal";
import { useNativeReadinessState } from "./nativeReadinessState";

/** Inputs of the native publishing configuration; final (also the props of `LivePublishingBridge`). */
export type NativePublishingConfigOptions = {
  /** Session token sent to the native publisher. */
  token: string;
  /** Only a Traveler configures native publishing. */
  role: Role;
  /**
   * While set (epoch ms), GPS is suppressed and a successful configure does not retry native tracking. Read via a
   * ref, never as an effect dependency, so a change cannot reconfigure (each `configure()` cancels an upload).
   */
  gpsSuppressedUntil: number | null;
};

/**
 * What the bridge configures. `tags` is the capture trip (`null`: untagged, exactly the pre-multi-trip
 * configuration). `pending` is true only on a first-ever launch while the trip state is still loading: nothing is
 * configured until it resolves or `FIRST_LAUNCH_WAIT_MS` passes.
 */
export type PublishingIdentity = { pending: boolean; tags: NativePublishingTags | null };

const DEBUG_MYSTERY_PINS_KEY = "tripcast.mystery.showAllPinsDebug";
/** Last known publishing identity per token hash: `{"multiTripEnabled":false}` or the tags with `true`. */
const IDENTITY_KEY_PREFIX = "tripcast.live-publishing.identity.";
/** Last publishing epoch seen per token hash, so a switch made while the app was closed still ends live sharing. */
const LAST_EPOCH_KEY_PREFIX = "tripcast.live-sharing.last-epoch.";
/** With no identity ever known, how long a loading trip state may hold back the first (untagged) configure. */
export const FIRST_LAUNCH_WAIT_MS = 3_000;

export const TAGS_INTRODUCED_NOTICE = "Live sharing stopped. Tap Live to resume.";
export function tripChangedNotice(title: string): string {
  return `Live sharing stopped: Followers now see ${title}.`;
}

/** Non-reversible short hash (FNV-1a, 32 bit) that scopes stored publishing state to a session token. */
export function tokenScope(token: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sameTags(a: NativePublishingTags | null | undefined, b: NativePublishingTags | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tripId === b.tripId && a.publishingEpoch === b.publishingEpoch && a.tripTitle === b.tripTitle;
}

/** The last known identity for `scope`: tags, `null` (multi-trip known disabled) or `undefined` (never known). */
function readPublishingIdentity(scope: string): NativePublishingTags | null | undefined {
  try {
    const stored = localStorage.getItem(IDENTITY_KEY_PREFIX + scope);
    if (stored === null) return undefined;
    const value = JSON.parse(stored) as Partial<NativePublishingTags> & { multiTripEnabled?: unknown };
    if (value.multiTripEnabled === false) return null;
    if (
      value.multiTripEnabled === true &&
      typeof value.tripId === "string" &&
      typeof value.publishingEpoch === "number" &&
      typeof value.tripTitle === "string"
    ) {
      return { tripId: value.tripId, publishingEpoch: value.publishingEpoch, tripTitle: value.tripTitle };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the identity the server reported for `token` (`null`: multi-trip disabled). */
export function writePublishingIdentity(token: string, tags: NativePublishingTags | null): void {
  try {
    localStorage.setItem(
      IDENTITY_KEY_PREFIX + tokenScope(token),
      JSON.stringify(tags ? { multiTripEnabled: true, ...tags } : { multiTripEnabled: false }),
    );
  } catch {
    // Storage unavailable: the next launch behaves as a first launch.
  }
}

/**
 * Forgets what the bridge remembered for `token` (the last known publishing identity, including the trip title, and
 * the last seen epoch). Call it on sign-out, with the session's token, so nothing about the trip stays in storage.
 */
export function clearPublishingIdentity(token: string): void {
  const scope = tokenScope(token);
  try {
    localStorage.removeItem(IDENTITY_KEY_PREFIX + scope);
    localStorage.removeItem(LAST_EPOCH_KEY_PREFIX + scope);
  } catch {
    // Storage unavailable: nothing was stored.
  }
}

function readLastEpoch(scope: string): number | null {
  try {
    const stored = localStorage.getItem(LAST_EPOCH_KEY_PREFIX + scope);
    const value = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLastEpoch(scope: string, epoch: number): void {
  try {
    localStorage.setItem(LAST_EPOCH_KEY_PREFIX + scope, String(epoch));
  } catch {
    // The in-memory epoch still covers this session.
  }
}

function readDebugMysteryPins(): boolean {
  try {
    return localStorage.getItem(DEBUG_MYSTERY_PINS_KEY) === "true";
  } catch {
    return false;
  }
}

/** The debug "show all Mystery pins" flag, kept in sync with the debug panel (same source TripMap reads). */
function useDebugMysteryPins(): boolean {
  const [enabled, setEnabled] = useState(readDebugMysteryPins);
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setEnabled(detail && typeof detail.enabled === "boolean" ? detail.enabled : readDebugMysteryPins());
    };
    window.addEventListener("tripcast:mystery-debug-pins", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tripcast:mystery-debug-pins", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return enabled;
}

/** Keeps the last loaded value while a query re-subscribes (a trip switch), so the phone is not configured with a gap. */
function useLastLoaded<T>(value: T | undefined): T | undefined {
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  return last.current;
}

/** Ends a live or snoozed session because the shared trip changed; true when there was one. Never turns sharing on. */
function stopLiveSharingForTripChange(): boolean {
  const wasLive = getLiveSharingEnabled() || readLiveSnooze() !== null;
  if (!wasLive) return false;
  clearLiveSnooze();
  setLiveSharingEnabled(false);
  return true;
}

/**
 * Resolves what the bridge publishes under, without any settings query. While the context's `serverTripStatus` is
 * `known`, that is the shared current trip (only while multi-trip is enabled). While it is `loading` or
 * `unavailable` (cold launch, failing subscription), it is the last known identity for this token, so the phone keeps
 * exactly its configuration: no untagged configure, no usage-guard flip, no extra upload cancel. With nothing ever
 * known it is untagged, after waiting up to `FIRST_LAUNCH_WAIT_MS` for a loading state. The tags are shared with
 * TripMap's JS publisher and the usage estimates (`setNativePublishingTags`).
 */
export function usePublishingIdentity(token: string, role: Role): PublishingIdentity {
  const { currentTrip, multiTripEnabled, serverTripStatus = "known" } = useTripContext();
  const scope = useMemo(() => tokenScope(token), [token]);
  const traveler = role === "traveler";
  const known = serverTripStatus === "known";
  const liveTripId = traveler && multiTripEnabled && currentTrip ? currentTrip.tripId : undefined;
  const liveEpoch = liveTripId !== undefined ? currentTrip?.publishingEpoch : undefined;
  const liveTitle = liveTripId !== undefined ? currentTrip?.title : undefined;

  const [memory, setMemory] = useState(() => ({ scope, identity: readPublishingIdentity(scope) }));
  const remembered = memory.scope === scope ? memory.identity : readPublishingIdentity(scope);
  const [waitedScope, setWaitedScope] = useState<string | null>(null);

  let pending = false;
  let tags: NativePublishingTags | null = null;
  if (!traveler) {
    tags = null;
  } else if (known) {
    tags =
      liveTripId !== undefined && liveEpoch !== undefined && liveTitle !== undefined
        ? { tripId: liveTripId, publishingEpoch: liveEpoch, tripTitle: liveTitle }
        : null;
  } else if (remembered !== undefined) {
    tags = remembered;
  } else {
    pending = serverTripStatus === "loading" && waitedScope !== scope;
  }
  const tripId = tags?.tripId;
  const publishingEpoch = tags?.publishingEpoch;
  const tripTitle = tags?.tripTitle;

  // Remember what the server reported for this token, for the next launch or a failing subscription.
  useEffect(() => {
    if (!traveler || !known) return;
    const next =
      liveTripId !== undefined && liveEpoch !== undefined && liveTitle !== undefined
        ? { tripId: liveTripId, publishingEpoch: liveEpoch, tripTitle: liveTitle }
        : null;
    const stored = readPublishingIdentity(scope);
    if (stored === undefined || !sameTags(stored, next)) writePublishingIdentity(token, next);
    setMemory((previous) =>
      previous.scope === scope && previous.identity !== undefined && sameTags(previous.identity, next)
        ? previous
        : { scope, identity: next },
    );
  }, [known, liveEpoch, liveTitle, liveTripId, scope, token, traveler]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setWaitedScope(scope), FIRST_LAUNCH_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [pending, scope]);

  useEffect(() => {
    setNativePublishingTags(
      tripId !== undefined && publishingEpoch !== undefined && tripTitle !== undefined
        ? { tripId, publishingEpoch, tripTitle }
        : null,
    );
  }, [publishingEpoch, tripId, tripTitle]);
  useEffect(() => () => setNativePublishingTags(null), []);

  return useMemo(
    () => ({
      pending,
      tags:
        tripId !== undefined && publishingEpoch !== undefined && tripTitle !== undefined
          ? { tripId, publishingEpoch, tripTitle }
          : null,
    }),
    [pending, publishingEpoch, tripId, tripTitle],
  );
}

/**
 * Ends live sharing when the shared trip changes; runs no settings query, so a failing one cannot disable it. When
 * the publishing epoch changes (a switch here, on another device, or while the app was closed) or the phone reports
 * `gps:native-publish:revoked`, a live or snoozed session is turned off locally and one notice is posted
 * (`reportLiveSharingStopped`); sharing is never turned back on. Mounted before the configure component, so sharing
 * is already off when the phone receives a new epoch.
 */
export function useTripChangeStop(token: string, role: Role, tags: NativePublishingTags | null): void {
  const log = useDebugLogger("LivePublishingBridge", "src/native/useNativePublishingConfig.ts");
  const scope = useMemo(() => tokenScope(token), [token]);
  const publishingEpoch = tags?.publishingEpoch;
  const tripTitle = tags?.tripTitle;

  const lastEpochRef = useRef<number | null>(null);
  const lastEpochScopeRef = useRef<string | null>(null);
  const latestTripRef = useRef<{ title: string; publishingEpoch: number } | null>(null);
  const pendingTripNoticeRef = useRef(false);

  useEffect(() => {
    if (publishingEpoch === undefined || tripTitle === undefined) return;
    if (lastEpochScopeRef.current !== scope) {
      lastEpochScopeRef.current = scope;
      lastEpochRef.current = readLastEpoch(scope);
    }
    latestTripRef.current = { title: tripTitle, publishingEpoch };
    const previous = lastEpochRef.current;
    lastEpochRef.current = publishingEpoch;
    if (previous === publishingEpoch) return;
    writeLastEpoch(scope, publishingEpoch);
    if (previous === null) return;
    const wasLive = stopLiveSharingForTripChange();
    const announce = wasLive || pendingTripNoticeRef.current;
    pendingTripNoticeRef.current = false;
    log.logGps("gps:live:trip-changed", { previousEpoch: previous, publishingEpoch, wasLive });
    if (announce) reportLiveSharingStopped(tripChangedNotice(tripTitle));
  }, [log, publishingEpoch, scope, tripTitle]);

  useEffect(() => {
    if (role !== "traveler") return;
    return subscribeNativePublishingRevoked((revoke) => {
      const wasLive = stopLiveSharingForTripChange();
      log.logGps("gps:live:revoked", { reason: revoke.reason, epoch: revoke.epoch ?? null, wasLive });
      if (!wasLive) return;
      if (revoke.reason === "tags-introduced") {
        reportLiveSharingStopped(TAGS_INTRODUCED_NOTICE);
        return;
      }
      const trip = latestTripRef.current;
      if (trip && (revoke.epoch === undefined || revoke.epoch <= trip.publishingEpoch)) {
        reportLiveSharingStopped(tripChangedNotice(trip.title));
      } else {
        // The new trip is not known here yet: the epoch effect posts the notice with its title.
        pendingTripNoticeRef.current = true;
      }
    });
  }, [log, role]);
}

/**
 * Keeps the native publisher configured (`configureNativeLocationPublishing`) for `identity`.
 *
 * The configuration adds `captureTripId`, `publishingEpoch` and `tripTitle` and the tagged usage guard only while
 * `identity.tags` is set; otherwise it is exactly the pre-multi-trip configuration. Nothing is configured while
 * `identity.pending`. The effect re-runs only when token, role, the identity, the publishing settings it reads
 * (those of the capture trip, never the viewed trip), or the retry nonce (`requestNativePublishingRetry`) change,
 * because every `configure()` cancels the in-flight upload. Readiness is reported through `setNativePublishingReady`.
 */
export function useNativePublishingConfig(
  { token, role, gpsSuppressedUntil }: NativePublishingConfigOptions,
  identity: PublishingIdentity,
): void {
  const log = useDebugLogger("LivePublishingBridge", "src/native/useNativePublishingConfig.ts");
  const pending = identity.pending;
  const captureTripId = identity.tags?.tripId;
  const publishingEpoch = identity.tags?.publishingEpoch;
  const tripTitle = identity.tags?.tripTitle;
  const tripTagsSent = captureTripId !== undefined && publishingEpoch !== undefined;

  const gpsSuppressedRef = useRef(gpsSuppressedUntil !== null);
  gpsSuppressedRef.current = gpsSuppressedUntil !== null;

  const adaptiveGpsEnabled = useAdaptiveGpsEnabled();
  const staleBreadcrumbAlertSeconds = useStaleBreadcrumbAlertSeconds();
  const liveGpsUploadIntervalSeconds = useLiveGpsUploadIntervalSeconds();
  const debugShowAllMysteryPins = useDebugMysteryPins();
  const { captureReadiness } = useNativeReadinessState();
  const retryNonce = useSyncExternalStore(
    subscribeNativePublishingRetry,
    getNativePublishingRetryNonce,
    getNativePublishingRetryNonce,
  );

  // The capture trip's settings, never the viewed trip's: the trip id is explicit while tagged and absent (as before
  // multi-trip) otherwise.
  const tripArgs = captureTripId ? { token, tripId: captureTripId } : { token };
  const movementPrefs = useLastLoaded(
    useTripQuery(tripcastApi.travelerPreferences.travelerGetPreferences, role === "traveler" ? tripArgs : "skip"),
  );
  const liveTrailStatus = useLastLoaded(
    useTripQuery(tripcastApi.liveTrail.travelerGetLiveTrailStatus, role === "traveler" ? tripArgs : "skip"),
  );
  const cloakingPins = useQuery(
    tripcastApi.cloakingPins.travelerListCloakingPins,
    role === "traveler" ? { token } : "skip",
  );
  const liveTrailEnabled = role === "traveler" && liveTrailStatus?.enabled === true;
  const movementDetectionEnabled = movementPrefs?.movementDetectionEnabled === true;
  // Compared by value so a fresh but equal result does not reconfigure.
  const cloakZonesJson = JSON.stringify(
    (Array.isArray(cloakingPins) ? cloakingPins : []).map((pin) => ({
      lat: pin.lat,
      lon: pin.lon,
      radiusMeters: pin.radiusMeters,
    })),
  );

  useEffect(() => {
    setNativePublishingReady(captureReadiness === "ready");
  }, [captureReadiness]);

  useEffect(() => {
    if (role !== "traveler" || !isAdaptiveLocationAvailable()) {
      setNativePublishingReady(false);
      return;
    }
    const endpoint = import.meta.env.VITE_CONVEX_URL as string | undefined;
    if (!endpoint) {
      setNativePublishingReady(false);
      return;
    }
    // First-ever launch, trip state still loading: the phone keeps its stored configuration until it resolves.
    if (pending) return;
    let cancelled = false;
    let cloakTimeoutSeconds = 300;
    try {
      const minutes = Number(
        localStorage.getItem("tripcast.cloaking.autoDisableGpsTimeoutMinutes") ?? "5",
      );
      if (Number.isFinite(minutes) && minutes >= 0) cloakTimeoutSeconds = minutes * 60;
    } catch {
      // Keep the privacy-first default.
    }
    configureNativeLocationPublishing({
      endpoint,
      token,
      liveTrailEnabled,
      movementDetectionEnabled,
      emissionIntervalSeconds: liveGpsUploadIntervalSeconds,
      alertThresholdSeconds: staleBreadcrumbAlertSeconds,
      cloakTimeoutSeconds,
      cloakZones: JSON.parse(cloakZonesJson) as Array<{ lat: number; lon: number; radiusMeters: number }>,
      includeDebugMysteryMissions: debugShowAllMysteryPins,
      // Always sent: a configuration without the guard lifts the phone's usage pause. Tagged uploads cost more, so the
      // tagged figure is sent only with the tags; untagged it is exactly today's guard. Switching between the two is a
      // full reconfigure (not tags-only): the in-flight upload is cancelled and retried and the pause re-evaluated.
      usageGuard: {
        bytesPerUpload: usageBytesPerUpload(tripTagsSent),
        monthlyLimitBytes: USAGE_GUARD.monthlyLimitBytes,
        pausePercent: USAGE_GUARD.pausePercent,
      },
      // Rollout guard: only while the server reports (or last reported) multi-trip enabled; older backends reject these.
      ...(tripTagsSent ? { captureTripId, publishingEpoch, tripTitle } : {}),
    })
      .then(() => {
        if (!cancelled && adaptiveGpsEnabled && getLiveSharingEnabled() && !gpsSuppressedRef.current) {
          void retryNativeLocationTracking();
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setNativePublishingReady(false);
        log.error("gps:native-publish:configure-failure", "error", {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    adaptiveGpsEnabled,
    captureTripId,
    cloakZonesJson,
    debugShowAllMysteryPins,
    liveGpsUploadIntervalSeconds,
    liveTrailEnabled,
    log,
    movementDetectionEnabled,
    pending,
    publishingEpoch,
    retryNonce,
    role,
    staleBreadcrumbAlertSeconds,
    token,
    tripTagsSent,
    tripTitle,
  ]);
}
