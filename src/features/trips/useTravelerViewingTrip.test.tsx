import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import type { Role } from "../../convex/tripcastApi";
import type { TripTarget } from "./tripTypes";
import { useTravelerViewingTrip } from "./useTravelerViewingTrip";

const autumn: TripTarget = { tripId: "trip-autumn", title: "Autumn 2026" };
const summer: TripTarget = { tripId: "trip-summer", title: "Summer 2026" };
const winter: TripTarget = { tripId: "trip-winter", title: "Winter 2027" };

type Props = { currentTarget: TripTarget | null; role?: Role; token?: string };
function setup(role: Role = "traveler", currentTarget: TripTarget | null = autumn) {
  return renderHook((props: Props) => useTravelerViewingTrip({ ...props, role: props.role ?? role }), {
    initialProps: { currentTarget } as Props,
  });
}

describe("useTravelerViewingTrip", () => {
  it("starts in follow_current on the current trip", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn", viewingTrip: autumn });
  });

  it("has no viewed trip until the current trip is known", () => {
    const { result } = setup("traveler", null);
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: null, viewingTrip: null });
  });

  it("openPrivately switches to private on that trip, and returnToCurrent goes back", () => {
    const { result } = setup();
    act(() => result.current.openPrivately(summer));
    expect(result.current).toMatchObject({ viewingMode: "private", viewingTripId: "trip-summer", viewingTrip: summer });
    act(() => result.current.returnToCurrent());
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn", viewingTrip: autumn });
  });

  it("a follow_current device follows a server switch", () => {
    const { result, rerender } = setup();
    rerender({ currentTarget: winter });
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-winter", viewingTrip: winter });
  });

  it("a private device stays on its trip when the server switches", () => {
    const { result, rerender } = setup();
    act(() => result.current.openPrivately(summer));
    rerender({ currentTarget: winter });
    expect(result.current).toMatchObject({ viewingMode: "private", viewingTripId: "trip-summer", viewingTrip: summer });
  });

  it("returnToCurrent lands on the LATEST server trip", () => {
    const { result, rerender } = setup();
    act(() => result.current.openPrivately(summer));
    rerender({ currentTarget: winter });
    act(() => result.current.returnToCurrent());
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-winter", viewingTrip: winter });
  });

  it("a Follower can never view privately", () => {
    const { result } = setup("follower");
    act(() => result.current.openPrivately(summer));
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn", viewingTrip: autumn });
  });

  it("drops the private view when the current trip becomes unknown (flag off), and does not resurrect it", () => {
    const { result, rerender } = setup();
    act(() => result.current.openPrivately(summer));
    rerender({ currentTarget: null });
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: null, viewingTrip: null });
    rerender({ currentTarget: autumn });
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
  });

  it("clears the private view when the token or role changes", () => {
    const { result, rerender } = setup();
    act(() => result.current.openPrivately(summer));
    rerender({ currentTarget: autumn, token: "other-token" });
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
    act(() => result.current.openPrivately(summer));
    rerender({ currentTarget: autumn, token: "other-token", role: "follower" });
    expect(result.current.viewingMode).toBe("follow_current");
  });

  it("returns to current when the privately viewed trip is reported unavailable", () => {
    const { result } = setup();
    act(() => result.current.openPrivately(summer));
    act(() => result.current.reportTripUnavailable("trip-other"));
    expect(result.current.viewingMode).toBe("private");
    act(() => result.current.reportTripUnavailable("trip-summer"));
    expect(result.current).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
  });

  it("works under StrictMode", () => {
    const { result } = renderHook(() => useTravelerViewingTrip({ role: "traveler", currentTarget: autumn }), {
      wrapper: StrictMode,
    });
    act(() => result.current.openPrivately(summer));
    expect(result.current.viewingTripId).toBe("trip-summer");
  });
});
