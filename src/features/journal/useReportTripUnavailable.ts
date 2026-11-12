import { useCallback } from "react";

import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { tripErrorInfo } from "../trips/tripSwitchState";
import type { TripTarget } from "../trips/tripTypes";

/**
 * Call from the place a failed trip write is already handled: when the server says the write's trip no longer exists
 * (`trip_not_found`), tells the context so a private view of that trip returns to the shared current trip. Any other
 * error, an untagged write (`target` null) and no provider do nothing.
 */
export function useReportTripUnavailable(): (error: unknown, target: TripTarget | null) => void {
  const { reportTripUnavailable } = useOptionalTripContext();
  return useCallback(
    (error, target) => {
      if (target && tripErrorInfo(error).code === "trip_not_found") reportTripUnavailable?.(target.tripId);
    },
    [reportTripUnavailable],
  );
}
