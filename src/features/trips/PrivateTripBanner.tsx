import { Eye } from "lucide-react";

import { setLiveSharingEnabled, useLiveSharingEnabled } from "@/lib/liveSharingPreference";
import { useTripContext } from "../../providers/TripContextProvider";

/**
 * Shown only while the Traveler views another trip privately: names the viewed trip and the trip Followers see,
 * offers Return to current, and (while live sharing is on) names the live trip with a Stop control. Stop turns the
 * live-sharing preference off and works from any view. Mounted by the app shell.
 */
export function PrivateTripBanner() {
  const {
    role,
    multiTripEnabled,
    viewingMode,
    viewingTrip,
    currentTrip,
    followerTrip,
    returnToCurrent,
    serverTripStatus = "known",
  } = useTripContext();
  const live = useLiveSharingEnabled();

  if (role !== "traveler" || !multiTripEnabled || viewingMode !== "private") return null;

  const viewed = viewingTrip?.title ?? "another trip";
  // While the shared trip is loading or unavailable, say so quietly instead of naming a trip that may be wrong.
  const shared = serverTripStatus === "known" ? (currentTrip?.title ?? followerTrip?.title ?? null) : null;

  return (
    <div
      role="status"
      className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--ink-1)] shadow-[var(--shadow-card)]"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          Viewing {viewed} privately.
          {shared ? ` Followers are viewing ${shared}.` : ""}
        </p>
        {shared ? null : (
          <p className="font-normal text-[var(--ink-3)]">
            {serverTripStatus === "loading" ? "Loading what Followers see…" : "What Followers see is unavailable right now."}
          </p>
        )}
        {live && shared ? <p className="font-normal text-[var(--ink-2)]">Live on {shared}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {live ? (
          <button
            type="button"
            className="rounded border border-[var(--ink-danger)] px-2.5 py-1.5 font-semibold text-[var(--ink-danger)]"
            onClick={() => setLiveSharingEnabled(false)}
          >
            Stop
          </button>
        ) : null}
        <button
          type="button"
          className="rounded bg-[var(--ink-1)] px-2.5 py-1.5 font-semibold text-[var(--ink-on-dark)]"
          onClick={returnToCurrent}
        >
          Return to current
        </button>
      </div>
    </div>
  );
}
