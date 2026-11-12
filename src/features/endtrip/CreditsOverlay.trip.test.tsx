import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import CreditsOverlay from "./CreditsOverlay";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div> },
}));

const callsFor = (ref: unknown) =>
  vi.mocked(convexReact.useQuery).mock.calls.filter((call) => call[0] === ref).map((call) => call[1] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
});

const overlay = (value: Partial<TripContextValue>, role: "traveler" | "follower" = "traveler") => (
  <TripContextTestProvider value={{ ...value, role }}>
    <CreditsOverlay token="t" role={role} onClose={vi.fn()} />
  </TripContextTestProvider>
);

describe("CreditsOverlay with trips", () => {
  it("reads the credits, events and missions of the trip it opened on, even after the view changes", () => {
    const { rerender } = render(overlay(travelerViewingPrivately));
    rerender(overlay(travelerFollowingCurrent));
    for (const ref of [
      tripcastApi.endTrip.getTripCredits,
      tripcastApi.journalEvents.listJournalEvents,
      tripcastApi.missions.travelerListMissions,
    ]) {
      expect(callsFor(ref).at(-1)).toEqual({ token: "t", tripId: "trip-other" });
    }
  });

  it("sends only the token with multi-trip disabled", () => {
    render(overlay({ multiTripEnabled: false }));
    expect(callsFor(tripcastApi.endTrip.getTripCredits).at(-1)).toEqual({ token: "t" });
    expect(callsFor(tripcastApi.missions.travelerListMissions).at(-1)).toEqual({ token: "t" });
  });

  it("sends only the token for a Follower", () => {
    render(overlay(travelerViewingPrivately, "follower"));
    expect(callsFor(tripcastApi.endTrip.getTripCredits).at(-1)).toEqual({ token: "t" });
    expect(callsFor(tripcastApi.missions.followerListMissions).at(-1)).toEqual({ token: "t" });
  });
});
