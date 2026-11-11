import type { TripTarget } from "./tripTypes";

/** Props of `TripTargetLabel`; final. */
export type TripTargetLabelProps = {
  /** The trip the editor captured when it opened; `null` (untagged, Legacy rule) renders nothing. */
  target: TripTarget | null;
  className?: string;
};

/**
 * Names the trip an editing sheet writes to ("Summer 2026"), so a sheet opened before a switch still shows its
 * captured target.
 *
 * Final behaviour (W1): renders the target's title while `multiTripEnabled` (from `useTripContext()`), nothing
 * otherwise. WC stub: multi-trip is disabled, so it renders nothing.
 */
export function TripTargetLabel(props: TripTargetLabelProps) {
  void props;
  return null;
}
