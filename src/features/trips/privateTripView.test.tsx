import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { useIsSharedCurrentTrip, useLiveActionGate, useTripClientKey } from "./privateTripView";

const current = (over: Partial<CurrentTrip> = {}): CurrentTrip => ({
  tripId: "A",
  title: "Autumn",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
  ...over,
});

function run<T>(hook: () => T, value?: Partial<TripContextValue>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TripContextTestProvider value={value}>{children}</TripContextTestProvider>
  );
  return renderHook(hook, { wrapper }).result.current;
}
const traveler = (over: Partial<TripContextValue> = {}): Partial<TripContextValue> => ({
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: current(),
  ...over,
});

describe("useLiveActionGate", () => {
  const b = { tripId: "B", title: "Summer" };
  it("is unrestricted for a Follower, multi-trip disabled, no target and no provider", () => {
    expect(run(() => useLiveActionGate("go", b), { role: "follower", multiTripEnabled: true, currentTrip: current() }).allowed).toBe(true);
    expect(run(() => useLiveActionGate("go", b), { role: "traveler", multiTripEnabled: false }).allowed).toBe(true);
    expect(run(() => useLiveActionGate("go", null), traveler()).allowed).toBe(true);
  });
  it("compares the target's id with the shared current trip, then its lifecycle", () => {
    expect(run(() => useLiveActionGate("go", b), traveler())).toEqual({ allowed: false, reason: "Return to Autumn to go" });
    expect(run(() => useLiveActionGate("go", { tripId: "A", title: "Autumn" }), traveler()).allowed).toBe(true);
    expect(run(() => useLiveActionGate("go", { tripId: "A", title: "Autumn" }), traveler({ currentTrip: current({ lifecycle: "completed" }) }))).toEqual({
      allowed: false,
      reason: "Autumn isn't in progress",
    });
  });
});

describe("useIsSharedCurrentTrip", () => {
  it("compares ids for a Traveler with multi-trip on and is true otherwise", () => {
    expect(run(() => useIsSharedCurrentTrip("B"), traveler())).toBe(false);
    expect(run(() => useIsSharedCurrentTrip("A"), traveler())).toBe(true);
    expect(run(() => useIsSharedCurrentTrip("B"), { role: "traveler", multiTripEnabled: false })).toBe(true);
    expect(run(() => useIsSharedCurrentTrip("B"), { role: "follower", multiTripEnabled: false })).toBe(true);
  });
});

describe("useTripClientKey", () => {
  it("is empty with no viewed trip and for the Legacy Trip, the trip id otherwise", () => {
    expect(run(() => useTripClientKey(), {})).toBe("");
    expect(run(() => useTripClientKey(), traveler({ viewingTripId: "A" }))).toBe("A");
    expect(run(() => useTripClientKey(), traveler({ viewingTripId: "A", currentTrip: current({ isLegacy: true }) }))).toBe("");
    expect(
      run(() => useTripClientKey(), {
        role: "follower",
        viewingTripId: "A",
        followerTrip: { tripId: "A", title: "Autumn", lifecycle: "in_progress", isLegacy: true },
      }),
    ).toBe("");
    expect(run(() => useTripClientKey(), traveler({ viewingTripId: "B", currentTrip: current({ isLegacy: true }) }))).toBe("B");
  });
});
