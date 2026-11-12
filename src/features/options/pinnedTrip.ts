import { useCallback } from "react";

import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { tripErrorInfo } from "../trips/tripSwitchState";
import type { TripTarget } from "../trips/tripTypes";

/**
 * Explicit `tripId` arg that pins a read to the trip a sheet captured when it opened (an export, an import preview), so
 * a view change while the sheet is open cannot move it. Empty without a target (multi-trip disabled, no provider), so
 * those requests are exactly what they were before multi-trip.
 */
export function pinnedTripArgs(target: TripTarget | null): { tripId?: string } {
  return target ? { tripId: target.tripId } : {};
}

/**
 * For a catch block of a write to `target`: when the server says that trip is gone (`trip_not_found`), tells the trip
 * context so a private view of it returns to the shared trip. Any other error, or no target, does nothing.
 */
export function useReportTripGone(target: TripTarget | null): (error: unknown) => void {
  const { reportTripUnavailable } = useOptionalTripContext();
  return useCallback(
    (error: unknown) => {
      if (target && tripErrorInfo(error).code === "trip_not_found") reportTripUnavailable?.(target.tripId);
    },
    [target, reportTripUnavailable],
  );
}
