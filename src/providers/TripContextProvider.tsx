import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { ErrorBoundary } from "react-error-boundary";

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

type ServerTrips = { current: CurrentTrip | null | undefined; effective: EffectiveTrip | null | undefined };
const NO_SERVER_TRIPS: ServerTrips = { current: undefined, effective: undefined };

/**
 * Remembers the Legacy Trip's id once the trip query (or a catalog card opened privately) has named it, so the Legacy
 * Trip keeps today's client-side keys (rule 11) when viewed privately after another trip became shared, even after a
 * restart. Trip ids are unique, so a value left by another account never matches a trip of this one.
 */
const LEGACY_TRIP_ID_KEY = "tripcast.legacyTripId";

function readLegacyTripId(): string | null {
  try {
    return localStorage.getItem(LEGACY_TRIP_ID_KEY);
  } catch {
    return null;
  }
}

function storeLegacyTripId(tripId: string) {
  try {
    if (localStorage.getItem(LEGACY_TRIP_ID_KEY) !== tripId) localStorage.setItem(LEGACY_TRIP_ID_KEY, tripId);
  } catch {
    // Storage unavailable: the id is still known for this session.
  }
}

/** Delay before retrying a failed subscription when no visibility or online event comes first. */
const SUBSCRIPTION_RETRY_MS = 20_000;

type SubscriptionProps = {
  token: string;
  role: Role;
  onResult: (result: ServerTrips) => void;
  onHealthy: () => void;
};

/**
 * Renders nothing; owns the two server subscriptions and reports their results to the provider. It lives in its own
 * error boundary, so a failing query (older backend, transient or session error) never unmounts the app tree.
 */
function TripSubscription({ token, role, onResult, onHealthy }: SubscriptionProps) {
  const current = useQuery(tripcastApi.trips.getCurrentTrip, role === "traveler" ? { token } : "skip");
  const effective = useQuery(tripcastApi.followers.getEffectiveTrip, role === "follower" ? { token } : "skip");
  useEffect(() => onHealthy(), [onHealthy]);
  useEffect(() => onResult({ current, effective }), [current, effective, onResult]);
  return null;
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
  const [server, setServer] = useState<ServerTrips>(NO_SERVER_TRIPS);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const onResult = useCallback((next: ServerTrips) => {
    // Compare by value: a query result may be a fresh object on every render (as test mocks return), and
    // storing it by identity would loop render -> effect -> setState.
    setServer((prev) =>
      JSON.stringify([prev.current, prev.effective]) === JSON.stringify([next.current, next.effective]) ? prev : next,
    );
  }, []);
  const onHealthy = useCallback(() => setFailed(false), []);
  const onError = useCallback((error: unknown) => {
    console.error("Trip context subscription failed", error);
    setServer(NO_SERVER_TRIPS);
    setFailed(true);
  }, []);

  useEffect(() => {
    if (!failed) return;
    const retry = () => setRetryNonce((n) => n + 1);
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
  const [legacyTripId, setLegacyTripId] = useState<string | null>(readLegacyTripId);
  const learnLegacyTrip = useCallback((tripId: string) => {
    storeLegacyTripId(tripId);
    setLegacyTripId(tripId);
  }, []);
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

  return (
    <TripContext.Provider value={value}>
      <ErrorBoundary fallbackRender={() => null} resetKeys={[token, role, retryNonce]} onError={onError}>
        <TripSubscription token={token} role={role} onResult={onResult} onHealthy={onHealthy} />
      </ErrorBoundary>
      {children}
    </TripContext.Provider>
  );
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
