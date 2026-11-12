import { useOptionalTripContext } from "../../providers/TripContextProvider";
import type { TripTarget } from "./tripTypes";

/**
 * True while a Traveler with multi-trip on shows the shared current trip's live position for `tripId`'s content.
 * (Declared first: the label helpers below use it.)
 */
export function useIsSharedCurrentTrip(tripId: string | null): boolean {
  const { role, multiTripEnabled, currentTrip } = useOptionalTripContext();
  if (role !== "traveler" || !multiTripEnabled || !tripId) return true;
  return tripId === currentTrip?.tripId;
}

/**
 * Title of `target` when a Traveler with multi-trip on writes to a trip that is not the shared current trip, compared by
 * trip id (so a form opened in a private view still names its trip after Return to current, and a privately viewed trip
 * that became the shared current trip stops being named), otherwise `null` (so copy, labels and tests are exactly
 * today's). While the shared current trip is not known yet, only a private view names its target. Safe without a
 * `TripContextProvider`.
 */
export function usePrivateTripTitle(target: TripTarget | null): string | null {
  const { role, multiTripEnabled, currentTrip, viewingMode } = useOptionalTripContext();
  if (role !== "traveler" || !multiTripEnabled || !target) return null;
  const differs = currentTrip ? target.tripId !== currentTrip.tripId : viewingMode === "private";
  return differs ? target.title : null;
}

/** Names `target` unless it is the shared current trip (`TripTargetLabel` renders this); needs no provider. */
export function PrivateTripTargetLabel({ target, className }: { target: TripTarget | null; className?: string }) {
  const title = usePrivateTripTitle(target);
  if (title === null) return null;
  return (
    <p
      data-testid="trip-target-label"
      className={["text-xs text-[var(--meadow-ink-soft)]", className].filter(Boolean).join(" ")}
    >
      {title}
    </p>
  );
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

/**
 * Key suffix for client-side state that holds one trip's content (dismissed prompts, unread markers, caches). `""`
 * (today's key) when no trip is known or the viewed or followed trip is the Legacy Trip, so bootstrapping a deployment
 * resets nothing; the trip id otherwise. The Legacy flag comes from the viewed trip (`viewingTrip.isLegacy`, also set
 * for a private view) or from the shared trip when it is the one viewed.
 */
export function useTripClientKey(): string {
  const { role, viewingTripId, viewingTrip, currentTrip, followerTrip } = useOptionalTripContext();
  if (!viewingTripId) return "";
  if (viewingTrip?.isLegacy && viewingTrip.tripId === viewingTripId) return "";
  const info = role === "follower" ? followerTrip : currentTrip;
  if (info?.isLegacy && info.tripId === viewingTripId) return "";
  return viewingTripId;
}
