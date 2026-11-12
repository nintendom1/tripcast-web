import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";

import { tripcastApi, type CurrentTrip, type EffectiveTrip, type Role } from "../convex/tripcastApi";
import type { ServerTripStatus, TripContextValue, TripTarget } from "../features/trips/tripTypes";
import { useTravelerViewingTrip } from "../features/trips/useTravelerViewingTrip";

const TripContext = createContext<TripContextValue | null>(null);

/** Props of `TripContextProvider`; final (W1 keeps them). */
export type TripContextProviderProps = {
  /** Session token of the signed-in user. */
  token: string;
  /** Role of the signed-in user. */
  role: Role;
  children: ReactNode;
};

const noop = () => {};

/** The inert value: multi-trip disabled, `follow_current`, no trip ids, no-op actions. */
function inertTripContext(token: string, role: Role): TripContextValue {
  return {
    token,
    role,
    currentTrip: null,
    followerTrip: null,
    viewingMode: "follow_current",
    viewingTripId: null,
    viewingTrip: null,
    openPrivately: noop,
    returnToCurrent: noop,
    multiTripEnabled: false,
    reportTripUnavailable: noop,
    serverTripStatus: "known",
  };
}


/**
 * Non-reversible short hash (FNV-1a, 32 bit) of a session token, for keys of state stored per session; the same scheme
 * as the publishing identity's `tokenScope` (src/native/useNativePublishingConfig.ts), which cannot be imported here
 * without a provider <-> native import cycle. Another account (another token) never reads or overwrites such a key.
 */
export function sessionScope(token: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Remembers the Legacy Trip's id once the trip query (or a catalog card opened privately) has named it, so the Legacy
 * Trip keeps today's client-side keys (rule 11) when viewed privately after another trip became shared, even after a
 * restart. Kept per session (`sessionScope`), so a second account on the device neither reads nor overwrites it.
 */
const LEGACY_TRIP_ID_KEY_PREFIX = "tripcast.legacyTripId.";

function readLegacyTripId(scope: string): string | null {
  try {
    return localStorage.getItem(LEGACY_TRIP_ID_KEY_PREFIX + scope);
  } catch {
    return null;
  }
}

function storeLegacyTripId(scope: string, tripId: string) {
  try {
    if (readLegacyTripId(scope) !== tripId) localStorage.setItem(LEGACY_TRIP_ID_KEY_PREFIX + scope, tripId);
  } catch {
    // Storage unavailable: the id is still known for this session.
  }
}

/** Delay before retrying a failed subscription when no visibility or online event comes first. */
const SUBSCRIPTION_RETRY_MS = 20_000;

/**
 * Keeps a query result by value: a result that is equal but a fresh object (as test mocks return) keeps its identity, so
 * nothing downstream re-runs for it.
 */
function useStableResult<T>(value: T | undefined): T | undefined {
  const key = value === undefined ? undefined : JSON.stringify(value);
  // The key stands for the value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => value, [key]);
}

/**
 * Provides the multi-trip context to the signed-in tree (mounted in `App.tsx`): subscribes to
 * `trips.getCurrentTrip` (Traveler) or `followers.getEffectiveTrip` (Follower), keeps the in-memory viewing state
 * and exposes `openPrivately` and `returnToCurrent`.
 *
 * While multi-trip is disabled, before the query resolves, or while the subscription is failing, the value equals
 * the inert defaults; `serverTripStatus` (`known`, `loading`, `unavailable`) tells these cases apart. `children` keep one element type at one tree position in every case (no remount of the map or
 * the publishing bridge); a failed subscription is retried on a timer, on `visibilitychange` and on `online`.
 */
export function TripContextProvider({ token, role, children }: TripContextProviderProps) {
  // The server trip is read HERE, in the provider's own render, never handed over by an effect: every consumer sees the
  // trip change in the same render as the data of the trip it names (a Follower's untagged reads re-run on the server
  // in the same transition as `getEffectiveTrip`, so a render in between would pair the new trip's data with the old
  // trip's caches). A retry renders the queries skipped once, so they subscribe again.
  const [resubscribing, setResubscribing] = useState(false);
  // A failing trip query (older backend, transient or session error) must not unmount the app tree, so its error is
  // caught here. Both calls are unconditional: `useQuery` runs all of its own hooks first and throws only at its end (an
  // error result), so the hook order is the same in every render. A boundary cannot do this: React unmounts a
  // boundary's children when it catches, which would remount the map and the publishing bridge.
  let current: CurrentTrip | null | undefined;
  let effective: EffectiveTrip | null | undefined;
  let failure: unknown = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    current = useQuery(tripcastApi.trips.getCurrentTrip, role === "traveler" && !resubscribing ? { token } : "skip");
  } catch (caught) {
    failure = caught;
  }
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    effective = useQuery(tripcastApi.followers.getEffectiveTrip, role === "follower" && !resubscribing ? { token } : "skip");
  } catch (caught) {
    failure ??= caught;
  }
  const failed = failure !== null;
  // While failing the context is inert, as before multi-trip.
  const server = {
    current: useStableResult(failed ? undefined : current),
    effective: useStableResult(failed ? undefined : effective),
  };

  useEffect(() => {
    if (resubscribing) setResubscribing(false);
  }, [resubscribing]);

  useEffect(() => {
    // Once per failure, not per render.
    if (failed) console.error("Trip context subscription failed", failure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    if (!failed) return;
    const retry = () => setResubscribing(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    const timer = window.setInterval(retry, SUBSCRIPTION_RETRY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", retry);
    };
  }, [failed]);

  // Multi-trip is on only when the server says so (Traveler). A Follower has no flag: it follows the effective trip.
  const currentTrip = role === "traveler" && server.current?.multiTripEnabled === true ? server.current : null;
  const followerTrip = role === "follower" && server.effective ? server.effective : null;
  const multiTripEnabled = currentTrip !== null;
  const serverResult = role === "traveler" ? server.current : server.effective;
  const serverTripStatus: ServerTripStatus = failed ? "unavailable" : serverResult === undefined ? "loading" : "known";

  const serverTarget = useMemo<TripTarget | null>(() => {
    const source = currentTrip ?? followerTrip;
    return source ? { tripId: source.tripId, title: source.title } : null;
  }, [currentTrip, followerTrip]);
  const viewing = useTravelerViewingTrip({ role, token, currentTarget: serverTarget });

  // The Legacy flag of the viewed trip, with no extra subscription: the trip query says it for the shared trip, and the
  // Legacy Trip's id, once learned from it (or from a catalog card passed to `openPrivately`), is remembered, so a
  // private view of the Legacy Trip after another trip became shared still knows it. Learned and stored only for a
  // Traveler with multi-trip on (Followers read `followerTrip.isLegacy`; they never view privately).
  const scope = useMemo(() => sessionScope(token), [token]);
  const [learned, setLearned] = useState(() => ({ scope, tripId: readLegacyTripId(scope) }));
  // Another session (sign-out, another account): read that session's own value, never the previous one's.
  if (learned.scope !== scope) setLearned({ scope, tripId: readLegacyTripId(scope) });
  const legacyTripId = learned.scope === scope ? learned.tripId : null;
  const learnLegacyTrip = useCallback(
    (tripId: string) => {
      storeLegacyTripId(scope, tripId);
      setLearned({ scope, tripId });
    },
    [scope],
  );
  const sharedLegacyTripId = currentTrip?.isLegacy ? currentTrip.tripId : null;
  useEffect(() => {
    if (sharedLegacyTripId) learnLegacyTrip(sharedLegacyTripId);
  }, [sharedLegacyTripId, learnLegacyTrip]);

  const { openPrivately: openViewPrivately, viewingTrip: viewedTarget } = viewing;
  const openPrivately = useCallback(
    (target: TripTarget) => {
      if (role === "traveler" && multiTripEnabled && target.isLegacy === true) learnLegacyTrip(target.tripId);
      openViewPrivately(target);
    },
    [role, multiTripEnabled, learnLegacyTrip, openViewPrivately],
  );
  const viewingTrip = useMemo<TripTarget | null>(() => {
    if (!viewedTarget) return null;
    const shared = role === "traveler" ? currentTrip : followerTrip;
    const isLegacy =
      (shared?.tripId === viewedTarget.tripId && shared.isLegacy) ||
      (role === "traveler" && multiTripEnabled && viewedTarget.tripId === legacyTripId);
    // Only a Legacy Trip is marked; any other target keeps its identity and shape.
    return isLegacy && viewedTarget.isLegacy !== true ? { ...viewedTarget, isLegacy: true } : viewedTarget;
  }, [viewedTarget, role, currentTrip, followerTrip, multiTripEnabled, legacyTripId]);

  const value = useMemo<TripContextValue>(
    () => ({
      token,
      role,
      currentTrip,
      // For the Traveler the Followers' trip mirrors the current trip (banner copy).
      followerTrip: role === "traveler" ? currentTrip : followerTrip,
      multiTripEnabled,
      serverTripStatus,
      ...viewing,
      viewingTrip,
      openPrivately,
    }),
    [token, role, currentTrip, followerTrip, multiTripEnabled, serverTripStatus, viewing, viewingTrip, openPrivately],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

/** Props of `TripContextTestProvider`. */
export type TripContextTestProviderProps = {
  /** Fields merged over the inert defaults (token `"test-token"`, role `"traveler"`). */
  value?: Partial<TripContextValue>;
  children: ReactNode;
};

/**
 * Tests only: seeds the trip context without Convex, so component tests can set `viewingTripId`, `viewingMode`,
 * `multiTripEnabled` and so on. Each field of `value` overrides the inert default.
 */
export function TripContextTestProvider({ value, children }: TripContextTestProviderProps) {
  const merged: TripContextValue = { ...inertTripContext("test-token", "traveler"), ...value };
  return <TripContext.Provider value={merged}>{children}</TripContext.Provider>;
}

/**
 * Reads the multi-trip context (shape: `TripContextValue`). Throws outside a `TripContextProvider`, so a missing
 * provider fails loudly instead of silently targeting the wrong trip. Components that render trip UI use this one.
 */
export function useTripContext(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTripContext must be used within a TripContextProvider");
  }
  return context;
}

/** What the trip-aware Convex hooks see without a provider: inert (no trip, multi-trip disabled). Stable identity. */
const NO_PROVIDER_CONTEXT = inertTripContext("", "traveler");

/**
 * Non-throwing `useTripContext` for the trip-aware Convex hooks (`useTripQuery`, `useTripMutation`, `useTripConvex`).
 * Outside a `TripContextProvider` it returns the inert value, so those hooks add no `tripId`, capture no target and
 * behave exactly like plain `convex/react` hooks; component tests and stories need no wrapper. With a provider it
 * returns the same value as `useTripContext`. Components that render trip UI must keep using `useTripContext`.
 */
export function useOptionalTripContext(): TripContextValue {
  return useContext(TripContext) ?? NO_PROVIDER_CONTEXT;
}
