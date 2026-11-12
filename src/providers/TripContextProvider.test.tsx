import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tripcastApi, type CurrentTrip, type EffectiveTrip } from "../convex/tripcastApi";
import type { TripContextValue } from "../features/trips/tripTypes";
import { useTripQuery } from "../convex/useTrip";
import { TripContextProvider, TripContextTestProvider, useOptionalTripContext, useTripContext } from "./TripContextProvider";
import { useJournalUnread } from "../features/journal/useJournalUnread";
import { useMessagingUnread } from "../features/messaging/useMessagingUnread";
import VoteTimeSplash from "../features/routevote/VoteTimeSplash";
import type { Doc, JournalEvent } from "../convex/tripcastApi";

const server = vi.hoisted(() => ({
  current: undefined as unknown,
  effective: undefined as unknown,
  throwCurrent: false,
  fresh: false,
  calls: [] as Array<{ ref: unknown; args: unknown }>,
  other: 0,
  votes: undefined as unknown,
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
    if (ref === tripcastApi.routeVotes.listVisibleRouteVotes) return server.votes;
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

  it("tells loading apart from multi-trip disabled and enabled (serverTripStatus)", () => {
    const view = mount("traveler");
    expect(seen).toMatchObject({ ...inert, role: "traveler", serverTripStatus: "loading" });

    server.current = trip("trip-legacy", "My First Trip", false);
    view.refresh();
    expect(seen).toMatchObject({ ...inert, role: "traveler", serverTripStatus: "known" });

    server.current = trip("trip-autumn", "Autumn 2026");
    view.refresh();
    expect(seen).toMatchObject({ multiTripEnabled: true, serverTripStatus: "known" });
  });

  it("reports a Follower's status from getEffectiveTrip", () => {
    const view = mount("follower");
    expect(seen.serverTripStatus).toBe("loading");
    server.effective = effective("trip-autumn", "Autumn 2026");
    view.refresh();
    expect(seen.serverTripStatus).toBe("known");
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

    it("reports unavailable while failing, loading on a retry, then known", () => {
      server.current = trip("trip-autumn", "Autumn 2026");
      const view = mount("traveler", <Child />);
      expect(seen.serverTripStatus).toBe("known");

      server.throwCurrent = true;
      view.refresh(<Child />);
      expect(seen).toMatchObject({ ...inert, role: "traveler", serverTripStatus: "unavailable" });

      server.throwCurrent = false;
      server.current = undefined;
      act(() => void vi.advanceTimersByTime(20_000));
      expect(seen).toMatchObject({ ...inert, role: "traveler", serverTripStatus: "loading" });

      server.current = trip("trip-autumn", "Autumn 2026");
      view.refresh(<Child />);
      expect(seen).toMatchObject({ multiTripEnabled: true, serverTripStatus: "known" });
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
      serverTripStatus: "known",
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

  it("useOptionalTripContext returns the inert value outside a provider and the provided value inside", () => {
    let outside: TripContextValue | undefined;
    function Optional() {
      outside = useOptionalTripContext();
      return null;
    }
    render(<Optional />);
    expect(outside).toMatchObject({ ...inert, token: "", role: "traveler" });
    render(
      <TripContextTestProvider value={{ multiTripEnabled: true, viewingTripId: "trip-x" }}>
        <Optional />
      </TripContextTestProvider>,
    );
    expect(outside).toMatchObject({ multiTripEnabled: true, viewingTripId: "trip-x", token: "test-token" });
  });
});

describe("the Legacy flag of the viewed trip (rule 11)", () => {
  const legacy = { ...trip("trip-legacy", "First trip"), isLegacy: true };
  const autumn = trip("trip-autumn", "Autumn 2026");
  const LEGACY_TARGET = { tripId: "trip-legacy", title: "First trip" };
  const LEGACY_ID_KEY = "tripcast.legacyTripId";

  beforeEach(() => {
    localStorage.clear();
    server.votes = undefined;
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  /** Legacy shared, then another device makes Autumn the shared trip; the Legacy Trip is then opened privately. */
  function legacyViewedPrivatelyAfterSwitch(children: ReactNode = <Probe />) {
    server.current = legacy;
    const view = mount("traveler", children);
    server.current = autumn;
    view.refresh(children);
    return view;
  }

  it("marks the shared Legacy Trip, then the Legacy Trip viewed privately after another trip became shared", () => {
    server.current = legacy;
    const view = mount("traveler");
    expect(seen.viewingTrip).toEqual({ ...LEGACY_TARGET, isLegacy: true });
    server.current = autumn;
    view.refresh();
    expect(seen.viewingTrip).toEqual({ tripId: "trip-autumn", title: "Autumn 2026" });
    act(() => seen.openPrivately(LEGACY_TARGET));
    expect(seen.viewingTrip).toEqual({ ...LEGACY_TARGET, isLegacy: true });
    act(() => seen.openPrivately({ tripId: "trip-summer", title: "Summer 2026" }));
    expect(seen.viewingTrip).toEqual({ tripId: "trip-summer", title: "Summer 2026" });
    expect(server.other).toBe(0);
  });

  it("remembers the Legacy Trip across a restart, and learns it from a catalog card passed to openPrivately", () => {
    legacyViewedPrivatelyAfterSwitch().unmount();
    expect(localStorage.getItem(LEGACY_ID_KEY)).toBe("trip-legacy");
    // Restart after the switch: the trip query never names the Legacy Trip again.
    server.current = autumn;
    mount("traveler");
    act(() => seen.openPrivately(LEGACY_TARGET));
    expect(seen.viewingTrip?.isLegacy).toBe(true);

    localStorage.clear();
    const fresh = mount("traveler");
    fresh.unmount();
    mount("traveler");
    act(() => seen.openPrivately({ ...LEGACY_TARGET, isLegacy: true }));
    expect(seen.viewingTrip?.isLegacy).toBe(true);
    expect(localStorage.getItem(LEGACY_ID_KEY)).toBe("trip-legacy");
  });

  it("stores nothing for a Follower or with multi-trip off, and marks a Follower's Legacy trip from getEffectiveTrip", () => {
    server.current = { ...legacy, multiTripEnabled: false };
    const traveler = mount("traveler");
    expect(seen.viewingTrip).toBeNull();
    traveler.unmount();
    server.effective = { ...effective("trip-legacy", "First trip"), isLegacy: true };
    mount("follower");
    expect(seen.viewingTrip).toEqual({ ...LEGACY_TARGET, isLegacy: true });
    expect(localStorage.getItem(LEGACY_ID_KEY)).toBeNull();
  });

  // One consumer per feature, through the real provider: each must read today's key for the Legacy Trip viewed privately.
  it("journal unread: the Legacy Trip viewed privately reads today's read marker", () => {
    localStorage.setItem("tripcast.journalLastReadAt", "5000");
    const events = [1_000, 6_000].map((occurredAt, i) => ({ _id: `e${i}`, narrativeLevel: "narrative", occurredAt }) as unknown as JournalEvent);
    function Journal() {
      seen = useTripContext();
      return <p data-testid="journal-unread">{useJournalUnread(events).unreadCount}</p>;
    }
    legacyViewedPrivatelyAfterSwitch(<Journal />);
    expect(screen.getByTestId("journal-unread")).toHaveTextContent("2");
    act(() => seen.openPrivately(LEGACY_TARGET));
    expect(screen.getByTestId("journal-unread")).toHaveTextContent("1");
  });

  it("chat unread: the Legacy Trip viewed privately reads today's read marker", () => {
    localStorage.setItem("tripcast.messagesLastReadAt", "5000");
    const messages = [1_000, 6_000].map((at, i) => ({ _id: `m${i}`, _creationTime: at, role: "follower", authorId: "f1" }) as unknown as Doc<"messages">);
    function Chat() {
      seen = useTripContext();
      return <p data-testid="chat-unread">{useMessagingUnread(messages, "t1", "traveler").unreadCount}</p>;
    }
    legacyViewedPrivatelyAfterSwitch(<Chat />);
    expect(screen.getByTestId("chat-unread")).toHaveTextContent("2");
    act(() => seen.openPrivately(LEGACY_TARGET));
    expect(screen.getByTestId("chat-unread")).toHaveTextContent("1");
  });

  it("vote splash: a splash dismissed on the shared Legacy Trip stays dismissed when it is viewed privately later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    server.votes = [{ _id: "vote-1", title: "Lunch?", expiresAt: 1_000_000 + 3_600_000, effectiveStatus: "active" }];
    const splash = () => screen.queryByRole("button", { name: "Cast your vote: Lunch?" });
    function Splash() {
      seen = useTripContext();
      return <VoteTimeSplash token="session-token" enabled onOpenVotes={() => {}} />;
    }
    server.current = legacy;
    const view = mount("traveler", <Splash />);
    fireEvent.click(splash()!);
    // The splash leaves through an exit animation.
    await waitFor(() => expect(splash()).toBeNull());
    server.current = autumn;
    view.refresh(<Splash />);
    expect(splash()).not.toBeNull();
    act(() => seen.openPrivately(LEGACY_TARGET));
    await waitFor(() => expect(splash()).toBeNull());
  });
});
