import { render } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentTrip } from "../convex/tripcastApi";
import type { TripContextValue } from "../features/trips/tripTypes";
import { ThemeProvider, TravelerThemeBridge } from "./ThemeProvider";
import { TripContextTestProvider } from "./TripContextProvider";

const server = vi.hoisted(() => ({ reads: [] as Array<{ name: string; args: unknown }> }));
vi.mock("convex/react", () => ({
  useQuery: (ref: never, args: unknown) => {
    if (args !== "skip") server.reads.push({ name: getFunctionName(ref), args });
    return undefined;
  },
}));

const AUTUMN: CurrentTrip = {
  tripId: "autumn",
  title: "Autumn 2026",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
};

function bridge(role: "traveler" | "follower", value?: Partial<TripContextValue>) {
  render(
    <ThemeProvider>
      <TripContextTestProvider value={{ role, ...value }}>
        <TravelerThemeBridge token="tok" role={role} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
  return Object.fromEntries(server.reads.map(({ name, args }) => [name, args]));
}

beforeEach(() => {
  server.reads = [];
  localStorage.clear();
});

describe("TravelerThemeBridge follows the shared trip", () => {
  it("in a private view the theme still reads the shared trip's auto state and preferences", () => {
    const reads = bridge("traveler", {
      multiTripEnabled: true,
      currentTrip: AUTUMN,
      viewingMode: "private",
      viewingTripId: "summer",
      viewingTrip: { tripId: "summer", title: "Summer 2026" },
    });
    expect(reads).toEqual({
      "travelerAutoState:travelerGetAutoState": { token: "tok", tripId: "autumn" },
      "travelerPreferences:travelerGetPreferences": { token: "tok", tripId: "autumn" },
    });
  });

  it("multi-trip off: exactly today's reads", () => {
    expect(bridge("traveler")).toEqual({
      "travelerAutoState:travelerGetAutoState": { token: "tok" },
      "travelerPreferences:travelerGetPreferences": { token: "tok" },
    });
  });

  it("a Follower: exactly today's reads, never a trip id", () => {
    const reads = bridge("follower", { followerTrip: { tripId: "autumn", title: "Autumn 2026", lifecycle: "in_progress", isLegacy: false } });
    expect(reads).toEqual({
      "travelerAutoState:followerGetAutoState": { token: "tok" },
      "travelerPreferences:followerGetPreferences": { token: "tok" },
    });
  });
});
