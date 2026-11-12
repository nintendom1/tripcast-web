import { useMemo } from "react";
import { useTripMutation, useTripQuery } from "../../convex/useTrip";

import { tripcastApi } from "../../convex/tripcastApi";
import { useOptionalTripContext } from "../../providers/TripContextProvider";

/**
 * Achievements data for the current user. `summary` is:
 * - `undefined` while loading,
 * - `null` when the user has no scoring identity (e.g. a Traveler with
 *   developer scoring disabled) — callers should render no scoring UI,
 * - a `ScoreSummary` object otherwise.
 */
export function useAchievements(token: string) {
  const summary = useTripQuery(tripcastApi.scoring.getScoreSummary, { token });
  const untoasted = useTripQuery(tripcastApi.scoring.listUntoastedAchievements, {
    token,
  });
  const markToasted = useTripMutation(tripcastApi.scoring.markAchievementsToasted);
  const markSeen = useTripMutation(tripcastApi.scoring.markAchievementsSeen);
  // This hook lives for the whole app, so the mutations' mount-time trip would go stale after a view change. The
  // marks belong to the achievements on screen: name the trip being viewed when they are made. Followers and the
  // disabled state (no viewed trip) add nothing, exactly as before.
  const { role, viewingTripId } = useOptionalTripContext();
  const viewedTrip = useMemo(
    () => (role === "follower" || !viewingTripId ? {} : { tripId: viewingTripId }),
    [role, viewingTripId],
  );
  return { summary, untoasted, markToasted, markSeen, viewedTrip };
}
