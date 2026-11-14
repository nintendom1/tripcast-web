import { useCallback, useEffect, useMemo, useState } from "react";

import type { Role } from "../../convex/tripcastApi";
import type { TripTarget, ViewingMode } from "./tripTypes";

/** Inputs of `useTravelerViewingTrip`. */
export type TravelerViewingTripOptions = {
  role: Role;
  /** Session token; a change of token (or role) drops the private view. */
  token?: string;
  /** The latest server current trip (id and title) as a target; `null` while unknown or multi-trip is off. */
  currentTarget: TripTarget | null;
};

/** What `useTravelerViewingTrip` returns: the viewing fields of `TripContextValue`. */
export type TravelerViewingTrip = {
  viewingMode: ViewingMode;
  viewingTripId: string | null;
  viewingTrip: TripTarget | null;
  openPrivately: (target: TripTarget) => void;
  returnToCurrent: () => void;
  reportTripUnavailable: (tripId: string) => void;
};

type PrivateView = { scope: string; target: TripTarget };

/**
 * In-memory viewing state for this device (never persisted; a cold start is `follow_current`).
 *
 * `follow_current` always derives from the latest `currentTarget`, so a server switch (here or on another device)
 * moves a following device and `returnToCurrent` lands on the latest trip. `private` keeps its own trip until
 * `returnToCurrent`, but exists only while a current trip is known (multi-trip enabled): when the flag turns off or
 * the current trip becomes unknown, the private target is dropped so no request carries a `tripId`. A token or role
 * change also clears it. Followers are always `follow_current`. No action touches GPS, sharing or the server.
 */
export function useTravelerViewingTrip({ role, token = "", currentTarget }: TravelerViewingTripOptions): TravelerViewingTrip {
  const scope = `${role}:${token}`;
  const [privateView, setPrivateView] = useState<PrivateView | null>(null);

  const openPrivately = useCallback(
    (target: TripTarget) => {
      if (role !== "traveler") return;
      setPrivateView({ scope, target: { tripId: target.tripId, title: target.title } });
    },
    [role, scope],
  );
  const returnToCurrent = useCallback(() => setPrivateView(null), []);
  const reportTripUnavailable = useCallback((tripId: string) => {
    setPrivateView((current) => (current?.target.tripId === tripId ? null : current));
  }, []);

  const hasCurrent = currentTarget !== null;
  const stale = privateView !== null && (privateView.scope !== scope || !hasCurrent);
  // Drop a stale private view for good (so it cannot resurrect when the flag turns back on); the derived value
  // below already ignores it in the meantime.
  useEffect(() => {
    if (stale) setPrivateView(null);
  }, [stale]);

  return useMemo(() => {
    const target = role === "traveler" && privateView && !stale ? privateView.target : null;
    const viewingTrip = target ?? currentTarget;
    return {
      viewingMode: target ? ("private" as const) : ("follow_current" as const),
      viewingTripId: viewingTrip?.tripId ?? null,
      viewingTrip,
      openPrivately,
      returnToCurrent,
      reportTripUnavailable,
    };
  }, [role, privateView, stale, currentTarget, openPrivately, returnToCurrent, reportTripUnavailable]);
}
