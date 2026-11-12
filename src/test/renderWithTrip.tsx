import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import type { TripContextValue } from "../features/trips/tripTypes";
import { TripContextTestProvider } from "../providers/TripContextProvider";

/** Tests only: a Traveler following the shared current trip with multi-trip enabled. */
export const travelerFollowingCurrent: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  viewingMode: "follow_current",
  viewingTripId: "trip-current",
  viewingTrip: { tripId: "trip-current", title: "Current Trip" },
};

/** Tests only: a Traveler viewing another trip privately (the shared current trip is untouched). */
export const travelerViewingPrivately: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  viewingMode: "private",
  viewingTripId: "trip-other",
  viewingTrip: { tripId: "trip-other", title: "Other Trip" },
};

/**
 * Tests only: `render` inside a `TripContextTestProvider` seeded with `trip` over the inert defaults. Component tests
 * that only need the trip-aware Convex hooks do not need it (they work without a provider); use it to set a trip.
 */
export function renderWithTrip(
  ui: ReactElement,
  { trip, ...options }: { trip?: Partial<TripContextValue> } & Omit<RenderOptions, "queries"> = {},
): RenderResult {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => <TripContextTestProvider value={trip}>{children}</TripContextTestProvider>,
  });
}
