import { TripTargetLabel } from "../trips/TripTargetLabel";
import type { TripTarget } from "../trips/tripTypes";
import { useOptionalTripContext } from "../../providers/TripContextProvider";

/**
 * Title of `target` while multi-trip is on and this device views a trip privately, otherwise `null` (so copy,
 * labels and tests are exactly today's). Safe without a `TripContextProvider`.
 */
export function usePrivateTripTitle(target: TripTarget | null): string | null {
  const { multiTripEnabled, viewingMode } = useOptionalTripContext();
  return multiTripEnabled && viewingMode === "private" && target ? target.title : null;
}

/** `TripTargetLabel` that renders nothing (and needs no provider) unless the device views privately. */
export function PrivateTripTargetLabel({ target, className }: { target: TripTarget | null; className?: string }) {
  const { multiTripEnabled, viewingMode } = useOptionalTripContext();
  if (!multiTripEnabled || viewingMode !== "private") return null;
  return <TripTargetLabel target={target} className={className} />;
}

export type LiveActionGate = { allowed: boolean; reason: string | null };

const ALLOWED: LiveActionGate = { allowed: true, reason: null };

/**
 * Live-only actions (opening a new Route Vote, starting a mission) ask Followers to take part, so they need the
 * viewed trip to be the shared current trip and in progress. A Follower, multi-trip disabled and no provider are
 * unrestricted. `verb` completes "Return to <trip> to …".
 */
export function useLiveActionGate(verb: string): LiveActionGate {
  const { role, multiTripEnabled, currentTrip, viewingTripId } = useOptionalTripContext();
  if (role !== "traveler" || !multiTripEnabled || !currentTrip) return ALLOWED;
  if (viewingTripId !== currentTrip.tripId) return { allowed: false, reason: `Return to ${currentTrip.title} to ${verb}` };
  if (currentTrip.lifecycle !== "in_progress") return { allowed: false, reason: `${currentTrip.title} isn't in progress` };
  return ALLOWED;
}
