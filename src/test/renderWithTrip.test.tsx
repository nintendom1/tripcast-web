import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi } from "../convex/tripcastApi";
import { useTripMutation, useTripQuery } from "../convex/useTrip";
import { renderWithTrip, travelerFollowingCurrent, travelerViewingPrivately } from "./renderWithTrip";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  mutation: vi.fn(async (..._args: unknown[]) => "ok"),
}));

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
  useMutation: () => mocks.mutation,
  useConvex: () => ({}),
}));

function Probe() {
  useTripQuery(tripcastApi.trips.getTripPreview, { token: "t" } as never);
  const update = useTripMutation(tripcastApi.trips.updateTrip);
  return <button onClick={() => void update({ token: "t" } as never)}>save</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useQuery.mockReturnValue(undefined);
});

describe("renderWithTrip", () => {
  it("renders the ui with no trip by default (inert)", () => {
    renderWithTrip(<Probe />);
    expect(screen.getByText("save")).toBeInTheDocument();
    expect(mocks.useQuery).toHaveBeenCalledWith(tripcastApi.trips.getTripPreview, { token: "t" });
  });

  it.each([
    ["a Traveler following the current trip", travelerFollowingCurrent, "trip-current"],
    ["a Traveler viewing another trip privately", travelerViewingPrivately, "trip-other"],
  ])("%s sends its tripId on a query and on a mutation captured at mount", async (_name, trip, tripId) => {
    renderWithTrip(<Probe />, { trip });
    expect(mocks.useQuery).toHaveBeenCalledWith(tripcastApi.trips.getTripPreview, { token: "t", tripId });
    screen.getByText("save").click();
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId });
  });

  it("merges a partial override over the ready-made value", () => {
    renderWithTrip(<Probe />, { trip: { ...travelerFollowingCurrent, viewingTripId: "trip-x" } });
    expect(mocks.useQuery).toHaveBeenCalledWith(tripcastApi.trips.getTripPreview, { token: "t", tripId: "trip-x" });
  });
});
