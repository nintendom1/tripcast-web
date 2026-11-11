import { useTripContext } from "../../providers/TripContextProvider";
import type { TripTarget } from "./tripTypes";

/** Props of `TripTargetLabel`; final. */
export type TripTargetLabelProps = {
  /** The trip the editor captured when it opened; `null` (untagged, Legacy rule) renders nothing. */
  target: TripTarget | null;
  className?: string;
};

/**
 * Names the trip an editing sheet writes to ("Summer 2026"), so a sheet opened before a switch still shows its
 * captured target. Renders the target's title only while `multiTripEnabled` and this device views privately;
 * nothing otherwise.
 */
export function TripTargetLabel({ target, className }: TripTargetLabelProps) {
  const { multiTripEnabled, viewingMode } = useTripContext();
  if (!multiTripEnabled || viewingMode !== "private" || !target) return null;
  return (
    <p
      data-testid="trip-target-label"
      className={["text-xs text-[var(--meadow-ink-soft)]", className].filter(Boolean).join(" ")}
    >
      {target.title}
    </p>
  );
}
