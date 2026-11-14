import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import AddCheckpointSheet from "./AddCheckpointSheet";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("exifreader", () => ({ default: { load: vi.fn() } }));

const AUTUMN: CurrentTrip = {
  tripId: "trip-autumn",
  title: "Autumn 2026",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
};
const SUMMER = { tripId: "trip-summer", title: "Summer 2026" };
// After Return to current: following the shared trip (Autumn).
const followingAutumn: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: AUTUMN,
  viewingMode: "follow_current",
  viewingTripId: AUTUMN.tripId,
  viewingTrip: { tripId: AUTUMN.tripId, title: AUTUMN.title },
};

function sheet(tripTarget: typeof SUMMER | null | undefined, trip: Partial<TripContextValue> | null = followingAutumn) {
  const ui = (
    <AddCheckpointSheet
      selectedCoordinate={{ lat: 1, lon: 2, source: "tap_add_mode" }}
      onSave={vi.fn()}
      onClose={vi.fn()}
      tripTarget={tripTarget}
    />
  );
  return render(trip === null ? ui : <TripContextTestProvider value={trip}>{ui}</TripContextTestProvider>);
}
const label = () => screen.queryByTestId("trip-target-label");

describe("AddCheckpointSheet names the trip it saves to", () => {
  it("a form opened on Summer and left open across Return to current still says Summer", () => {
    sheet(SUMMER);
    expect(label()).toHaveTextContent("Summer 2026");
  });

  it("says nothing when the form saves to the shared current trip", () => {
    sheet({ tripId: AUTUMN.tripId, title: AUTUMN.title });
    expect(label()).toBeNull();
  });

  it("says nothing with multi-trip off, for a Follower, without a trip, or without a provider", () => {
    for (const [target, trip] of [
      [SUMMER, { ...followingAutumn, multiTripEnabled: false }],
      [SUMMER, { ...followingAutumn, role: "follower" as const }],
      [null, followingAutumn],
      [undefined, followingAutumn],
      [SUMMER, null],
    ] as const) {
      const view = sheet(target, trip);
      expect(label()).toBeNull();
      view.unmount();
    }
  });
});
