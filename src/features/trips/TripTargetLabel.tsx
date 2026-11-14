import { PrivateTripTargetLabel } from "./privateTripView";
import type { TripTarget } from "./tripTypes";

/** Props of `TripTargetLabel`; final. */
export type TripTargetLabelProps = {
  /** The trip the editor captured when it opened; `null` (untagged, Legacy rule) renders nothing. */
  target: TripTarget | null;
  className?: string;
};

/**
 * Names the trip an editing sheet writes to ("Summer 2026"), so a sheet opened before a switch still shows its
 * captured target. Same rule and markup as `PrivateTripTargetLabel` (one implementation): shown for a Traveler with
 * multi-trip on while the target is not the shared current trip, compared by trip id (a form opened in a private view
 * still names its trip after Return to current; a viewed trip that became the shared one is no longer named). Nothing
 * otherwise, including for Followers and with multi-trip off.
 */
export function TripTargetLabel({ target, className }: TripTargetLabelProps) {
  return <PrivateTripTargetLabel target={target} className={className} />;
}
