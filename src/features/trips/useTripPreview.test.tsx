import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPreview } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { useTripPreview, type PreviewCandidate } from "./useTripPreview";

const server = vi.hoisted(() => ({
  oneShot: [] as Array<{ args: { tripId: string }; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  subscriptions: 0,
}));

vi.mock("convex/react", () => ({
  useConvex: () => ({
    query: (_ref: unknown, args: { tripId: string }) =>
      new Promise((resolve, reject) => {
        server.oneShot.push({ args, resolve, reject });
      }),
  }),
  useQuery: () => {
    server.subscriptions += 1;
    throw new Error("a preview must be a one-shot query, not a subscription");
  },
  usePaginatedQuery: () => {
    server.subscriptions += 1;
    throw new Error("a preview must not paginate");
  },
}));

const preview = (tripId: string, previewVersion = 1): TripPreview => ({
  tripId,
  previewStatus: "ready",
  previewVersion,
  storyCount: 1,
  missionCount: 2,
  routeVoteCount: 3,
  route: null,
  coverImageUrl: null,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <TripContextTestProvider>{children}</TripContextTestProvider>
);

const candidate = (tripId: string, previewVersion = 1): PreviewCandidate => ({ tripId, previewVersion });

beforeEach(() => {
  server.oneShot = [];
  server.subscriptions = 0;
});

describe("useTripPreview", () => {
  it("is idle without a candidate, loading, then ready after one one-shot call", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: null as PreviewCandidate | null },
    });
    expect(result.current.status).toBe("idle");

    rerender({ c: candidate("a") });
    expect(result.current.status).toBe("loading");
    expect(server.oneShot).toHaveLength(1);
    expect(server.oneShot[0].args).toMatchObject({ tripId: "a" });

    await act(async () => server.oneShot[0].resolve(preview("a")));
    expect(result.current).toEqual({ status: "ready", preview: preview("a") });
    expect(server.subscriptions).toBe(0);
  });

  it("memoises by tripId and previewVersion", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: candidate("a") },
    });
    await act(async () => server.oneShot[0].resolve(preview("a")));
    rerender({ c: candidate("b") });
    await act(async () => server.oneShot[1].resolve(preview("b")));
    expect(server.oneShot).toHaveLength(2);

    rerender({ c: candidate("a") });
    expect(result.current).toEqual({ status: "ready", preview: preview("a") });
    expect(server.oneShot).toHaveLength(2);

    rerender({ c: candidate("a", 2) });
    expect(result.current.status).toBe("loading");
    expect(server.oneShot).toHaveLength(3);
  });

  it("ignores a late response for a card that is no longer highlighted", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: candidate("a") },
    });
    rerender({ c: candidate("b") });
    await act(async () => server.oneShot[1].resolve(preview("b")));
    expect(result.current).toEqual({ status: "ready", preview: preview("b") });

    await act(async () => server.oneShot[0].resolve(preview("a")));
    expect(result.current).toEqual({ status: "ready", preview: preview("b") });
  });

  it("ignores a late success for a card that is no longer highlighted while the new card is still loading", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: candidate("a") },
    });
    rerender({ c: candidate("b") });
    await act(async () => server.oneShot[0].resolve(preview("a")));
    expect(result.current.status).toBe("loading");
  });

  it("ignores a late failure for a card that is no longer highlighted", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: candidate("a") },
    });
    rerender({ c: candidate("b") });
    await act(async () => server.oneShot[0].reject(new Error("late")));
    expect(result.current.status).toBe("loading");
  });

  it("reports unavailable when the call fails and does not cache the failure", async () => {
    const { result, rerender } = renderHook(({ c }) => useTripPreview(c), {
      wrapper,
      initialProps: { c: candidate("a") as PreviewCandidate | null },
    });
    await act(async () => server.oneShot[0].reject(new Error("boom")));
    expect(result.current.status).toBe("unavailable");

    rerender({ c: null });
    rerender({ c: candidate("a") });
    // A failure is never cached: highlighting the card again retries with a new call.
    expect(server.oneShot).toHaveLength(2);
    await act(async () => server.oneShot[1].resolve(preview("a")));
    expect(result.current).toEqual({ status: "ready", preview: preview("a") });
  });
});

describe("useTripPreview names the card's trip", () => {
  it("in a private view of another trip, the one-shot read still names the card's trip", async () => {
    const privateView = ({ children }: { children: ReactNode }) => (
      <TripContextTestProvider
        value={{ multiTripEnabled: true, viewingMode: "private", viewingTripId: "other", viewingTrip: { tripId: "other", title: "Other" } }}
      >
        {children}
      </TripContextTestProvider>
    );
    renderHook(() => useTripPreview(candidate("a")), { wrapper: privateView });
    expect(server.oneShot.map((call) => call.args.tripId)).toEqual(["a"]);
    expect(server.subscriptions).toBe(0);
  });
});
