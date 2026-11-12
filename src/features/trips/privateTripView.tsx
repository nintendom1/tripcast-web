import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { TripTargetLabel } from "./TripTargetLabel";
import type { TripTarget } from "./tripTypes";

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
 * Live-only actions (opening a new Route Vote, starting a mission, setting the current activity) need the trip the
 * write will go to to be the shared current trip and in progress. Pass the mutation's captured `.target`: the gate is
 * decided from the same trip as the write, by trip id, never from the current view. A Follower, multi-trip disabled,
 * an untagged target and no provider are unrestricted. `verb` completes "Return to <trip> to …".
 */
export function useLiveActionGate(verb: string, target: TripTarget | null): LiveActionGate {
  const { role, multiTripEnabled, currentTrip } = useOptionalTripContext();
  if (role !== "traveler" || !multiTripEnabled || !currentTrip || !target) return ALLOWED;
  if (target.tripId !== currentTrip.tripId) return { allowed: false, reason: `Return to ${currentTrip.title} to ${verb}` };
  if (currentTrip.lifecycle !== "in_progress") return { allowed: false, reason: `${currentTrip.title} isn't in progress` };
  return ALLOWED;
}

/** True while a Traveler with multi-trip on shows the shared current trip's live position for `tripId`'s content. */
export function useIsSharedCurrentTrip(tripId: string | null): boolean {
  const { role, multiTripEnabled, currentTrip } = useOptionalTripContext();
  if (role !== "traveler" || !multiTripEnabled || !tripId) return true;
  return tripId === currentTrip?.tripId;
}

/**
 * Key suffix for client-side state that holds one trip's content (dismissed prompts, unread markers). `""` (today's
 * key) when no trip is known or the viewed or followed trip is the Legacy Trip, so bootstrapping a deployment resets
 * nothing; the trip id otherwise. The Legacy flag is known only for the shared current trip.
 */
export function useTripClientKey(): string {
  const { role, viewingTripId, currentTrip, followerTrip } = useOptionalTripContext();
  if (!viewingTripId) return "";
  const info = role === "follower" ? followerTrip : currentTrip;
  if (info?.isLegacy && info.tripId === viewingTripId) return "";
  return viewingTripId;
}
