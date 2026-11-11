import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TripContextValue } from "../features/trips/tripTypes";
import { TripContextProvider, TripContextTestProvider, useTripContext } from "./TripContextProvider";

const convexCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("convex/react", () => {
  const record = () => {
    convexCalls.count += 1;
    throw new Error("the WC stub must not call Convex");
  };
  return { useQuery: record, useMutation: record, useAction: record, usePaginatedQuery: record, useConvex: record };
});

describe("TripContextProvider (WC stub)", () => {
  it("renders children and exposes the documented inert defaults without calling Convex", () => {
    let seen: TripContextValue | null = null;
    function Probe() {
      seen = useTripContext();
      return <p>child rendered</p>;
    }

    render(
      <TripContextProvider token="session-token" role="traveler">
        <Probe />
      </TripContextProvider>,
    );

    expect(screen.getByText("child rendered")).toBeInTheDocument();
    expect(seen).toMatchObject({
      token: "session-token",
      role: "traveler",
      currentTrip: null,
      followerTrip: null,
      viewingMode: "follow_current",
      viewingTripId: null,
      viewingTrip: null,
      multiTripEnabled: false,
    });
    const value = seen as unknown as TripContextValue;
    expect(() => value.openPrivately({ tripId: "trip-1", title: "Summer 2026" })).not.toThrow();
    expect(() => value.returnToCurrent()).not.toThrow();
    expect(value.viewingMode).toBe("follow_current");
    expect(value.viewingTripId).toBeNull();
    expect(convexCalls.count).toBe(0);
  });

  it("TripContextTestProvider merges a seeded value over the inert defaults", () => {
    const summer = { tripId: "trip-2", title: "Summer 2026" };
    let seen: TripContextValue | null = null;
    function Probe() {
      seen = useTripContext();
      return null;
    }

    render(
      <TripContextTestProvider
        value={{ viewingMode: "private", viewingTripId: summer.tripId, viewingTrip: summer, multiTripEnabled: true }}
      >
        <Probe />
      </TripContextTestProvider>,
    );

    expect(seen).toMatchObject({
      token: "test-token",
      role: "traveler",
      currentTrip: null,
      followerTrip: null,
      viewingMode: "private",
      viewingTripId: "trip-2",
      viewingTrip: summer,
      multiTripEnabled: true,
    });
    expect(convexCalls.count).toBe(0);
  });

  it("throws when used outside the provider", () => {
    function Orphan() {
      useTripContext();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow("useTripContext must be used within a TripContextProvider");
    spy.mockRestore();
  });
});
