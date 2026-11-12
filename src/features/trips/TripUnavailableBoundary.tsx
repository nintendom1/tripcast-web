import { useEffect, useState, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { useTripContext } from "../../providers/TripContextProvider";
import { tripErrorInfo } from "./tripSwitchState";

const NOTICE_MS = 4000;

/** Hands the gone trip back once, after the fallback commits (never during render). */
function ReportOnce({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
    // Once per fallback mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Wraps the trip-scoped content (map and dock) so a trip that vanished does not strand the device on an error screen.
 * - A Traveler with multi-trip on, viewing a trip privately, whose read fails with `trip_not_found`: the trip is
 *   reported (`reportTripUnavailable`, which returns the device to the current trip), a notice names it and the
 *   content renders again for the current trip.
 * - A Follower whose read fails with `trip_not_shared` (the shared trip changed under it): the content renders again
 *   once, silently.
 * Anything else, a second failure for the same trip, and every error while multi-trip is off, is rethrown to the
 * boundary above (the map's own fallback), exactly as before.
 */
export function TripUnavailableBoundary({ children }: { children: ReactNode }) {
  const { role, multiTripEnabled, viewingMode, viewingTrip, followerTrip, reportTripUnavailable } = useTripContext();
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  // The trip this boundary already recovered from: a second failure for it goes up instead of looping.
  const [handled, setHandled] = useState<string | null>(null);
  const viewKey = (role === "follower" ? followerTrip?.tripId : viewingTrip?.tripId) ?? null;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <ErrorBoundary
        resetKeys={[viewKey]}
        fallbackRender={({ error, resetErrorBoundary }) => {
          const code = tripErrorInfo(error).code;
          const privateTrip =
            role === "traveler" && multiTripEnabled && viewingMode === "private" && viewingTrip ? viewingTrip : null;
          if (privateTrip && code === "trip_not_found" && handled !== privateTrip.tripId) {
            return (
              <ReportOnce
                onMount={() => {
                  setHandled(privateTrip.tripId);
                  setNotice((previous) => ({
                    id: (previous?.id ?? 0) + 1,
                    message: `${privateTrip.title} is no longer available. Showing the current trip.`,
                  }));
                  reportTripUnavailable?.(privateTrip.tripId);
                  resetErrorBoundary();
                }}
              />
            );
          }
          if (role === "follower" && viewKey && code === "trip_not_shared" && handled !== viewKey) {
            return (
              <ReportOnce
                onMount={() => {
                  setHandled(viewKey);
                  resetErrorBoundary();
                }}
              />
            );
          }
          // Not ours: the boundary above (the map's fallback) handles it as before.
          throw error;
        }}
      >
        {children}
      </ErrorBoundary>
      {notice ? (
        <div
          key={notice.id}
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-24 z-[120] mx-auto w-fit max-w-sm rounded-full bg-[var(--ink-1)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-on-dark)] shadow-xl"
        >
          {notice.message}
        </div>
      ) : null}
    </>
  );
}
