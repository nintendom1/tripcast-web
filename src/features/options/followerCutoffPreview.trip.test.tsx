import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { useFollowerCutoffPreview } from "./followerCutoffPreview";

const server = vi.hoisted(() => ({ reads: [] as unknown[] }));
vi.mock("convex/react", () => ({
  useQuery: (_ref: never, args: unknown) => {
    server.reads.push(args);
    return args === "skip" ? undefined : { followerContentCutoffEnabled: true, followerContentCutoffAt: 5 };
  },
  useMutation: vi.fn(),
}));

const current = (over: Partial<CurrentTrip> = {}): CurrentTrip => ({
  tripId: "trip-current",
  title: "Current",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
  ...over,
});
const viewing = (tripId: string, over: Partial<TripContextValue> = {}): Partial<TripContextValue> => ({
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: current(),
  viewingTripId: tripId,
  viewingTrip: { tripId, title: tripId },
  ...over,
});
const wrap = (value?: Partial<TripContextValue>) => ({ children }: { children: ReactNode }) => (
  <TripContextTestProvider value={value}>{children}</TripContextTestProvider>
);

beforeEach(() => {
  sessionStorage.clear();
  server.reads = [];
});

describe("useFollowerCutoffPreview 'Show all' override per trip", () => {
  it("keeps two trips apart", () => {
    const a = renderHook(() => useFollowerCutoffPreview("traveler", "tok"), { wrapper: wrap(viewing("trip-a")) });
    act(() => a.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll.trip-a")).toBe("true");
    expect(a.result.current.showAll).toBe(true);
    expect(a.result.current.cutoffAt).toBeNull();
    const b = renderHook(() => useFollowerCutoffPreview("traveler", "tok"), { wrapper: wrap(viewing("trip-b")) });
    expect(b.result.current.showAll).toBe(false);
    expect(b.result.current.cutoffAt).toBe(5);
  });

  it("switching the view in one mounted hook does not carry the override over", () => {
    let value = viewing("trip-a");
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok"), {
      wrapper: ({ children }) => <TripContextTestProvider value={value}>{children}</TripContextTestProvider>,
    });
    act(() => hook.result.current.setShowAll(true));
    expect(hook.result.current.showAll).toBe(true);
    value = viewing("trip-b");
    hook.rerender();
    expect(hook.result.current.showAll).toBe(false);
  });

  it("reads the viewed trip's cutoff", () => {
    renderHook(() => useFollowerCutoffPreview("traveler", "tok"), { wrapper: wrap(viewing("trip-b")) });
    expect(server.reads.at(-1)).toEqual({ token: "tok", tripId: "trip-b" });
  });

  it("uses today's key and request when multi-trip is disabled", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok"), { wrapper: wrap({ role: "traveler", multiTripEnabled: false }) });
    act(() => hook.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll")).toBe("true");
    expect(server.reads.at(-1)).toEqual({ token: "tok" });
  });

  it("uses today's key for the Legacy Trip", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok"), {
      wrapper: wrap(viewing("legacy", { currentTrip: current({ tripId: "legacy", isLegacy: true }) })),
    });
    act(() => hook.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll")).toBe("true");
  });

  it("a Follower is never filtered or tagged", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("follower", "tok"), {
      wrapper: wrap({ role: "follower", multiTripEnabled: false }),
    });
    expect(hook.result.current).toMatchObject({ available: false, showAll: false, cutoffAt: null });
    expect(server.reads.at(-1)).toBe("skip");
  });

  it("a pinned trip decides the read and the storage key, not the view", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok", "trip-a"), { wrapper: wrap(viewing("trip-b")) });
    expect(server.reads.at(-1)).toEqual({ token: "tok", tripId: "trip-a" });
    act(() => hook.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll.trip-a")).toBe("true");
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll.trip-b")).toBeNull();
  });

  it("a pinned Legacy Trip keeps today's key", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok", "legacy"), {
      wrapper: wrap(viewing("trip-b", { currentTrip: current({ tripId: "legacy", isLegacy: true }) })),
    });
    act(() => hook.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll")).toBe("true");
  });

  it("a pinned Legacy Trip viewed privately (another trip shared) keeps today's key, from the viewed trip's isLegacy", () => {
    const hook = renderHook(() => useFollowerCutoffPreview("traveler", "tok", "legacy"), {
      wrapper: wrap({
        ...viewing("legacy"),
        viewingMode: "private",
        viewingTrip: { tripId: "legacy", title: "My Trip", isLegacy: true },
      }),
    });
    act(() => hook.result.current.setShowAll(true));
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll")).toBe("true");
    expect(sessionStorage.getItem("tripcast.followerCutoffShowAll.legacy")).toBeNull();
  });
});
