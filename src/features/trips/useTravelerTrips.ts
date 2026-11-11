import { useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";

import { tripcastApi, type TripCard, type TripLifecycle } from "../../convex/tripcastApi";
import { useTripContext } from "../../providers/TripContextProvider";

/** Cards per page of the trip pane. */
export const TRIP_PAGE_SIZE = 20;
/** Quiet time after the last keystroke before the search becomes a query argument. */
export const TRIP_SEARCH_DEBOUNCE_MS = 300;

export type TravelerTripsStatus = "loading-first" | "ready" | "loading-more" | "exhausted";

export type TravelerTrips = {
  cards: TripCard[];
  status: TravelerTripsStatus;
  loadMore: () => void;
};

/**
 * The trip pane's ONE paginated subscription to `trips.listTravelerTripCards`. Search and lifecycle are arguments
 * to it (search debounced). Mount it only while the pane is open: unmounting drops the subscription. It lists the
 * Traveler's catalog, not a trip's content, so it takes no `tripId`. A failing query throws to the nearest boundary.
 */
export function useTravelerTrips(search: string, lifecycle: TripLifecycle | null): TravelerTrips {
  const { token } = useTripContext();
  const [debounced, setDebounced] = useState(search.trim());

  useEffect(() => {
    const next = search.trim();
    const timer = window.setTimeout(() => setDebounced(next), TRIP_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { results, status, loadMore } = usePaginatedQuery(
    tripcastApi.trips.listTravelerTripCards,
    {
      token,
      ...(debounced ? { search: debounced } : {}),
      ...(lifecycle ? { lifecycle } : {}),
    },
    { initialNumItems: TRIP_PAGE_SIZE },
  );

  return {
    cards: results,
    status:
      status === "LoadingFirstPage"
        ? "loading-first"
        : status === "LoadingMore"
          ? "loading-more"
          : status === "CanLoadMore"
            ? "ready"
            : "exhausted",
    loadMore: () => loadMore(TRIP_PAGE_SIZE),
  };
}
