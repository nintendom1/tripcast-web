import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Role } from "../convex/tripcastApi";
import type { TripContextValue } from "../features/trips/tripTypes";

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
  };
}

/**
 * Provides the multi-trip context to the signed-in tree (mounted in `App.tsx`).
 *
 * Final behaviour (W1): subscribes to `trips.getCurrentTrip` (Traveler) or `followers.getEffectiveTrip` (Follower),
 * keeps the in-memory viewing state (`viewingMode`, `viewingTripId`, `viewingTrip`) and exposes `openPrivately`
 * and `returnToCurrent`.
 *
 * WC stub: inert. Reports multi-trip as disabled, `follow_current`, no trip ids, no-op actions, and makes no
 * Convex calls, so the app behaves exactly as before.
 */
export function TripContextProvider({ token, role, children }: TripContextProviderProps) {
  const value = useMemo(() => inertTripContext(token, role), [token, role]);
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
 * provider fails loudly instead of silently targeting the wrong trip.
 */
export function useTripContext(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTripContext must be used within a TripContextProvider");
  }
  return context;
}
