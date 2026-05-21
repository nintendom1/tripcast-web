import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";

/**
 * Achievements data for the current user. `summary` is:
 * - `undefined` while loading,
 * - `null` when the user has no scoring identity (e.g. a Traveler with
 *   developer scoring disabled) — callers should render no scoring UI,
 * - a `ScoreSummary` object otherwise.
 */
export function useAchievements(token: string) {
  const summary = useQuery(tripcastApi.scoring.getScoreSummary, { token });
  const untoasted = useQuery(tripcastApi.scoring.listUntoastedAchievements, {
    token,
  });
  const markToasted = useMutation(tripcastApi.scoring.markAchievementsToasted);
  const markSeen = useMutation(tripcastApi.scoring.markAchievementsSeen);
  return { summary, untoasted, markToasted, markSeen };
}
