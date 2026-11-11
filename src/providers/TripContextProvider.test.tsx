import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi, type CurrentTrip, type EffectiveTrip } from "../convex/tripcastApi";
import type { TripContextValue } from "../features/trips/tripTypes";
import { useTripQuery } from "../convex/useTrip";
import { TripContextProvider, TripContextTestProvider, useTripContext } from "./TripContextProvider";

const server = vi.hoisted(() => ({
  current: undefined as unknown,
  effective: undefined as unknown,
  throwCurrent: false,
  fresh: false,
  calls: [] as Array<{ ref: unknown; args: unknown }>,
  other: 0,
}));

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown, args: unknown) => {
    server.calls.push({ ref, args });
    if (args === "skip") return undefined;
    if (ref === tripcastApi.trips.getCurrentTrip) {
      if (server.throwCurrent) throw new Error("function not found");
      return server.fresh && server.current ? { ...(server.current as object) } : server.current;
    }
    if (ref === tripcastApi.followers.getEffectiveTrip) return server.effective;
    return undefined;
  },
  useMutation: () => {
    server.other += 1;
    throw new Error("the provider must not call mutations");
  },
  useAction: () => {
    server.other += 1;
    throw new Error("the provider must not call actions");
  },
  useConvex: () => {
    server.other += 1;
    throw new Error("the provider must not use the imperative client");
  },
}));

const trip = (tripId: string, title: string, multiTripEnabled = true): CurrentTrip => ({
  tripId,
  title,
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled,
});
const effective = (tripId: string, title: string): EffectiveTrip => ({
  tripId,
  title,
  lifecycle: "in_progress",
  isLegacy: false,
});

let seen: TripContextValue;
function Probe() {
  seen = useTripContext();
  return <p>child rendered</p>;
}
function mount(role: "traveler" | "follower", children: ReactNode = <Probe />) {
  const ui = (kids: ReactNode) => (
    <TripContextProvider token="session-token" role={role}>
      {kids}
    </TripContextProvider>
  );
  const view = render(ui(children));
  return { ...view, refresh: (kids: ReactNode = <Probe />) => view.rerender(ui(kids)) };
}

const inert = {
  token: "session-token",
  currentTrip: null,
  followerTrip: null,
  viewingMode: "follow_current",
  viewingTripId: null,
  viewingTrip: null,
  multiTripEnabled: false,
};

beforeEach(() => {
  server.current = undefined;
  server.effective = undefined;
  server.throwCurrent = false;
  server.fresh = false;
  server.calls = [];
  server.other = 0;
});

describe("TripContextProvider", () => {
  it("equals the inert defaults before the query resolves", () => {
    mount("traveler");
    expect(screen.getByText("child rendered")).toBeInTheDocument();
    expect(seen).toMatchObject({ ...inert, role: "traveler" });
    expect(server.other).toBe(0);
  });

  it("equals the inert defaults while the server reports multi-trip disabled", () => {
    server.current = trip("trip-legacy", "My First Trip", false);
    mount("traveler");
    expect(seen).toMatchObject({ ...inert, role: "traveler" });
  });

  it("subscribes to getCurrentTrip for a Traveler and skips getEffectiveTrip", () => {
    mount("traveler");
    expect(server.calls).toContainEqual({ ref: tripcastApi.trips.getCurrentTrip, args: { token: "session-token" } });
    expect(server.calls).toContainEqual({ ref: tripcastApi.followers.getEffectiveTrip, args: "skip" });
  });

  it("exposes the current trip once multi-trip is enabled", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    mount("traveler");
    expect(seen).toMatchObject({
      multiTripEnabled: true,
      viewingMode: "follow_current",
      viewingTripId: "trip-autumn",
      viewingTrip: { tripId: "trip-autumn", title: "Autumn 2026" },
      currentTrip: server.current,
    });
  });

  it("a follow_current device follows a server switch; a private device stays and only Followers' trip changes", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    const view = mount("traveler");
    server.current = trip("trip-winter", "Winter 2027");
    view.refresh();
    expect(seen.viewingTripId).toBe("trip-winter");

    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    expect(seen).toMatchObject({ viewingMode: "private", viewingTripId: "trip-summer" });
    server.current = trip("trip-spring", "Spring 2028");
    view.refresh();
    expect(seen).toMatchObject({
      viewingMode: "private",
      viewingTripId: "trip-summer",
      viewingTrip: { tripId: "trip-summer", title: "Summer 2026" },
    });
    expect(seen.followerTrip).toMatchObject({ tripId: "trip-spring" });
  });

  it("returnToCurrent uses the latest server trip", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    const view = mount("traveler");
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    server.current = trip("trip-winter", "Winter 2027");
    view.refresh();
    act(() => seen.returnToCurrent());
    expect(seen).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-winter" });
    expect(server.other).toBe(0);
  });

  it("a Follower reads getEffectiveTrip, follows it, and cannot go private", () => {
    server.effective = effective("trip-autumn", "Autumn 2026");
    const view = mount("follower");
    expect(server.calls).toContainEqual({ ref: tripcastApi.followers.getEffectiveTrip, args: { token: "session-token" } });
    expect(server.calls).toContainEqual({ ref: tripcastApi.trips.getCurrentTrip, args: "skip" });
    expect(seen).toMatchObject({
      multiTripEnabled: false,
      viewingMode: "follow_current",
      viewingTripId: "trip-autumn",
      followerTrip: server.effective,
      currentTrip: null,
    });
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    expect(seen).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
    server.effective = effective("trip-winter", "Winter 2027");
    view.refresh();
    expect(seen.viewingTripId).toBe("trip-winter");
  });

  describe("when the subscription throws", () => {
    let mounts: number;
    let spy: ReturnType<typeof vi.spyOn>;
    function Child() {
      useEffect(() => {
        mounts += 1;
      }, []);
      seen = useTripContext();
      return <p>child rendered</p>;
    }
    beforeEach(() => {
      mounts = 0;
      spy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      spy.mockRestore();
    });

    it("degrades to inert without remounting the children, then recovers on a timer, visibility or online", () => {
      server.current = trip("trip-autumn", "Autumn 2026");
      const view = mount("traveler", <Child />);
      expect(seen.multiTripEnabled).toBe(true);

      server.throwCurrent = true;
      view.refresh(<Child />);
      expect(screen.getByText("child rendered")).toBeInTheDocument();
      expect(seen).toMatchObject({ ...inert, role: "traveler" });
      expect(mounts).toBe(1);

      // Still failing: a retry stays inert.
      act(() => void vi.advanceTimersByTime(20_000));
      expect(seen.multiTripEnabled).toBe(false);

      // Timer retry once the backend works again.
      server.throwCurrent = false;
      act(() => void vi.advanceTimersByTime(20_000));
      expect(seen.multiTripEnabled).toBe(true);

      // online and visibilitychange also retry.
      for (const trigger of [
        () => window.dispatchEvent(new Event("online")),
        () => document.dispatchEvent(new Event("visibilitychange")),
      ]) {
        server.throwCurrent = true;
        view.refresh(<Child />);
        expect(seen.multiTripEnabled).toBe(false);
        server.throwCurrent = false;
        act(trigger);
        expect(seen.multiTripEnabled).toBe(true);
      }
      expect(mounts).toBe(1);
    });

    it("keeps the children mounted when the subscription fails on the very first render", () => {
      server.throwCurrent = true;
      mount("traveler", <Child />);
      expect(seen).toMatchObject({ ...inert, role: "traveler" });
      expect(mounts).toBe(1);
    });
  });

  it("drops a private view when the server stops reporting multi-trip, so no request carries a tripId", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    const view = mount("traveler");
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    expect(seen.viewingTripId).toBe("trip-summer");
    server.current = trip("trip-autumn", "Autumn 2026", false); // rollback: flag off
    view.refresh();
    expect(seen).toMatchObject({ ...inert, role: "traveler" });
    server.current = trip("trip-autumn", "Autumn 2026"); // flag back on: stays on current
    view.refresh();
    expect(seen).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
  });

  it("clears the private view when the token changes without unmounting", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    const view = mount("traveler");
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    view.rerender(
      <TripContextProvider token="other-token" role="traveler">
        <Probe />
      </TripContextProvider>,
    );
    expect(seen).toMatchObject({ token: "other-token", viewingMode: "follow_current", viewingTripId: "trip-autumn" });
  });

  it("returns to current when the privately viewed trip is reported unavailable", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    mount("traveler");
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    act(() => seen.reportTripUnavailable?.("trip-summer"));
    expect(seen).toMatchObject({ viewingMode: "follow_current", viewingTripId: "trip-autumn" });
  });

  it("does not loop when the query returns a fresh object on every render", () => {
    server.fresh = true;
    server.current = trip("trip-autumn", "Autumn 2026");
    mount("traveler");
    expect(seen).toMatchObject({ multiTripEnabled: true, viewingTripId: "trip-autumn" });
  });

  it("works under StrictMode", () => {
    server.current = trip("trip-autumn", "Autumn 2026");
    render(
      <StrictMode>
        <TripContextProvider token="session-token" role="traveler">
          <Probe />
        </TripContextProvider>
      </StrictMode>,
    );
    expect(seen).toMatchObject({ multiTripEnabled: true, viewingTripId: "trip-autumn" });
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    expect(seen).toMatchObject({ viewingMode: "private", viewingTripId: "trip-summer" });
  });

  it("a Follower's trip-aware request carries no tripId even though the context knows the effective trip", () => {
    server.effective = effective("trip-autumn", "Autumn 2026");
    function Reader() {
      useTripQuery(tripcastApi.trips.getTripPreview, { token: "session-token" } as never);
      return <Probe />;
    }
    mount("follower", <Reader />);
    expect(seen.viewingTripId).toBe("trip-autumn");
    const reads = server.calls.filter((c) => c.ref === tripcastApi.trips.getTripPreview);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.args).toEqual({ token: "session-token" });
  });

  it("TripContextTestProvider merges a seeded value over the inert defaults", () => {
    const summer = { tripId: "trip-2", title: "Summer 2026" };
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
