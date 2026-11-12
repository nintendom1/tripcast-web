import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider, useTripContext } from "../providers/TripContextProvider";
import type { TripContextValue } from "../features/trips/tripTypes";
import { tripcastApi } from "./tripcastApi";
import { tripClientFor, useTripConvex, useTripMutation, useTripPaginatedQuery, useTripQuery } from "./useTrip";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
  mutation: vi.fn(async (..._args: unknown[]) => "ok"),
  query: vi.fn(async (..._args: unknown[]) => "ok"),
  convex: {} as Record<string, unknown>,
}));

vi.mock("convex/react", () => {
  mocks.convex = { query: mocks.query, mutation: mocks.mutation, action: vi.fn() };
  return {
    useQuery: mocks.useQuery,
    usePaginatedQuery: mocks.usePaginatedQuery,
    useMutation: () => mocks.mutation,
    useConvex: () => mocks.convex,
  };
});

const summer = { tripId: "trip-summer", title: "Summer 2026" };
const autumn = { tripId: "trip-autumn", title: "Autumn 2026" };
const enabled: Partial<TripContextValue> = {
  multiTripEnabled: true,
  viewingTripId: autumn.tripId,
  viewingTrip: autumn,
};

function wrapperFor(getValue: () => Partial<TripContextValue>) {
  return ({ children }: { children: ReactNode }) => (
    <TripContextTestProvider value={getValue()}>{children}</TripContextTestProvider>
  );
}

// Trip-scoped refs under test (they accept `tripId`).
const queryRef = tripcastApi.trips.getTripPreview;
const mutationRef = tripcastApi.trips.updateTrip;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useQuery.mockReturnValue(undefined);
});

describe("useTripQuery", () => {
  it("sends no tripId while multi-trip is disabled (untagged, as before)", () => {
    renderHook(() => useTripQuery(queryRef, { token: "t" } as never), { wrapper: wrapperFor(() => ({})) });
    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, { token: "t" });
    expect(mocks.useQuery.mock.calls[0]?.[1]).not.toHaveProperty("tripId");
  });

  it("adds the viewed trip", () => {
    renderHook(() => useTripQuery(queryRef, { token: "t" } as never), { wrapper: wrapperFor(() => enabled) });
    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, { token: "t", tripId: "trip-autumn" });
  });

  it("lets an explicit tripId win", () => {
    renderHook(() => useTripQuery(queryRef, { token: "t", tripId: "trip-other" } as never), {
      wrapper: wrapperFor(() => enabled),
    });
    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, { token: "t", tripId: "trip-other" });
  });

  it('passes "skip" through', () => {
    renderHook(() => useTripQuery(queryRef, "skip"), { wrapper: wrapperFor(() => enabled) });
    expect(mocks.useQuery).toHaveBeenCalledWith(queryRef, "skip");
  });

  it("never returns a previous trip's result for a new trip", () => {
    const byTrip: Record<string, string> = { "trip-autumn": "autumn data", "trip-summer": "summer data" };
    mocks.useQuery.mockImplementation((_ref: unknown, args: { tripId?: string } | "skip") =>
      args === "skip" || !args.tripId ? undefined : byTrip[args.tripId],
    );
    let value: Partial<TripContextValue> = enabled;
    const { result, rerender } = renderHook(() => useTripQuery(queryRef, { token: "t" } as never), {
      wrapper: wrapperFor(() => value),
    });
    expect(result.current).toBe("autumn data");
    value = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    rerender();
    expect(result.current).toBe("summer data");
    expect(mocks.useQuery).toHaveBeenLastCalledWith(queryRef, { token: "t", tripId: "trip-summer" });
  });
});

describe("useTripMutation", () => {
  it("sends no tripId while disabled", async () => {
    const { result } = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => ({})) });
    await result.current({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t" });
    expect(result.current.target).toBeNull();
  });

  it("sends the trip captured at render, even if the view changes before the call", async () => {
    let value: Partial<TripContextValue> = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    const { result, rerender } = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => value) });
    const sheetMutation = result.current; // the open sheet holds the function from its render
    value = enabled; // the view moves to Autumn underneath it
    rerender();
    await sheetMutation({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId: "trip-summer" });
    expect(sheetMutation.target).toEqual(summer);
  });

  it("keeps the original trip when the SAME mounted component re-renders after the view changes", async () => {
    let value: Partial<TripContextValue> = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    const { result, rerender } = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => value) });
    value = enabled; // another device switched: the provider now views Autumn
    rerender();
    rerender();
    expect(result.current.target).toEqual(summer);
    await result.current({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId: "trip-summer" });
  });

  it("recapture() takes the trip being viewed right now", async () => {
    let value: Partial<TripContextValue> = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    const { result, rerender } = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => value) });
    value = enabled;
    rerender();
    act(() => result.current.recapture());
    expect(result.current.target).toEqual(autumn);
    await result.current({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId: "trip-autumn" });
  });

  it("captures once under StrictMode double rendering", async () => {
    const { result } = renderHook(() => useTripMutation(mutationRef), {
      wrapper: ({ children }) => (
        <StrictMode>
          <TripContextTestProvider value={enabled}>{children}</TripContextTestProvider>
        </StrictMode>
      ),
    });
    await result.current({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId: "trip-autumn" });
  });

  it("lets an explicit tripId win", async () => {
    const { result } = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => enabled) });
    await result.current({ token: "t", tripId: "trip-card" } as never);
    expect(mocks.mutation).toHaveBeenCalledWith({ token: "t", tripId: "trip-card" });
  });
});

describe("useTripConvex", () => {
  it("adds the captured trip to one-shot calls, with explicit tripId winning", async () => {
    const { result } = renderHook(() => useTripConvex(), { wrapper: wrapperFor(() => enabled) });
    await result.current.query(queryRef, { token: "t" } as never);
    await result.current.mutation(mutationRef, { token: "t", tripId: "trip-card" } as never);
    expect(mocks.query).toHaveBeenCalledWith(queryRef, { token: "t", tripId: "trip-autumn" });
    expect(mocks.mutation).toHaveBeenCalledWith(mutationRef, { token: "t", tripId: "trip-card" });
    expect(result.current.target).toEqual(autumn);
  });

  it("sends no tripId while disabled", async () => {
    const { result } = renderHook(() => useTripConvex(), { wrapper: wrapperFor(() => ({})) });
    await result.current.query(queryRef, { token: "t" } as never);
    expect(mocks.query).toHaveBeenCalledWith(queryRef, { token: "t" });
  });

  it("keeps its original trip when the same mounted component re-renders after the view changes", async () => {
    let value: Partial<TripContextValue> = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    const { result, rerender } = renderHook(() => useTripConvex(), { wrapper: wrapperFor(() => value) });
    value = enabled;
    rerender();
    await result.current.query(queryRef, { token: "t" } as never);
    expect(mocks.query).toHaveBeenCalledWith(queryRef, { token: "t", tripId: "trip-summer" });
    act(() => result.current.recapture());
    await result.current.query(queryRef, { token: "t" } as never);
    expect(mocks.query).toHaveBeenLastCalledWith(queryRef, { token: "t", tripId: "trip-autumn" });
  });
});

describe("without a TripContextProvider", () => {
  it("useTripQuery is plain useQuery: same args object, no tripId, skip passes through", () => {
    const args = { token: "t" } as never;
    renderHook(() => useTripQuery(queryRef, args));
    expect(mocks.useQuery.mock.calls[0]?.[0]).toBe(queryRef);
    expect(mocks.useQuery.mock.calls[0]?.[1]).toBe(args);
    renderHook(() => useTripQuery(queryRef, "skip"));
    expect(mocks.useQuery).toHaveBeenLastCalledWith(queryRef, "skip");
  });

  it("useTripMutation sends exactly the given args and captures no target", async () => {
    const { result } = renderHook(() => useTripMutation(mutationRef));
    const args = { token: "t" } as never;
    await result.current(args);
    expect(mocks.mutation.mock.calls[0]?.[0]).toBe(args);
    expect(result.current.target).toBeNull();
  });

  it("useTripConvex sends exactly the given args and captures no target", async () => {
    const { result } = renderHook(() => useTripConvex());
    const args = { token: "t" } as never;
    await result.current.query(queryRef, args);
    await result.current.mutation(mutationRef, args);
    expect(mocks.query.mock.calls[0]?.[1]).toBe(args);
    expect(mocks.mutation.mock.calls[0]?.[1]).toBe(args);
    expect(result.current.target).toBeNull();
  });

  it("useTripContext itself still throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTripContext())).toThrow("useTripContext must be used within");
    vi.restoreAllMocks();
  });
});

describe("Followers", () => {
  const follower: Partial<TripContextValue> = { ...enabled, role: "follower", multiTripEnabled: false };

  it("never send tripId from any trip hook, but keep the target for labels", async () => {
    const q = renderHook(() => useTripQuery(queryRef, { token: "t" } as never), { wrapper: wrapperFor(() => follower) });
    expect(mocks.useQuery).toHaveBeenLastCalledWith(queryRef, { token: "t" });
    expect(mocks.useQuery.mock.calls.at(-1)?.[1]).not.toHaveProperty("tripId");
    q.unmount();

    const m = renderHook(() => useTripMutation(mutationRef), { wrapper: wrapperFor(() => follower) });
    await m.result.current({ token: "t" } as never);
    expect(mocks.mutation).toHaveBeenLastCalledWith({ token: "t" });
    expect(m.result.current.target).toEqual(autumn);

    const c = renderHook(() => useTripConvex(), { wrapper: wrapperFor(() => follower) });
    await c.result.current.query(queryRef, { token: "t" } as never);
    expect(mocks.query).toHaveBeenLastCalledWith(queryRef, { token: "t" });
  });
});

// A paginated trip-scoped ref (its args take `tripId` and `paginationOpts`).
const pagedRef = tripcastApi.checkpoints.listTripMapPins;
const PAGE = { initialNumItems: 5 };

describe("useTripPaginatedQuery (same trip rule as useTripQuery)", () => {
  it("adds the viewed trip and lets an explicit tripId win", () => {
    renderHook(() => useTripPaginatedQuery(pagedRef, { token: "t" }, PAGE), { wrapper: wrapperFor(() => enabled) });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(pagedRef, { token: "t", tripId: "trip-autumn" }, PAGE);
    renderHook(() => useTripPaginatedQuery(pagedRef, { token: "t", tripId: "trip-card" }, PAGE), {
      wrapper: wrapperFor(() => enabled),
    });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(pagedRef, { token: "t", tripId: "trip-card" }, PAGE);
  });

  it("follows the view on re-render, so a view change is a new request", () => {
    let value: Partial<TripContextValue> = enabled;
    const { rerender } = renderHook(() => useTripPaginatedQuery(pagedRef, { token: "t" }, PAGE), {
      wrapper: wrapperFor(() => value),
    });
    value = { ...enabled, viewingTripId: summer.tripId, viewingTrip: summer };
    rerender();
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(pagedRef, { token: "t", tripId: "trip-summer" }, PAGE);
  });

  it("adds nothing while disabled, for a Follower, or without a provider; skip passes through", () => {
    renderHook(() => useTripPaginatedQuery(pagedRef, { token: "t" }, PAGE), { wrapper: wrapperFor(() => ({})) });
    expect(mocks.usePaginatedQuery.mock.calls.at(-1)?.[1]).toStrictEqual({ token: "t" });
    renderHook(() => useTripPaginatedQuery(pagedRef, { token: "t" }, PAGE), {
      wrapper: wrapperFor(() => ({ ...enabled, role: "follower" })),
    });
    expect(mocks.usePaginatedQuery.mock.calls.at(-1)?.[1]).toStrictEqual({ token: "t" });
    const args = { token: "t" };
    renderHook(() => useTripPaginatedQuery(pagedRef, args, PAGE));
    expect(mocks.usePaginatedQuery.mock.calls.at(-1)?.[1]).toBe(args);
    renderHook(() => useTripPaginatedQuery(pagedRef, "skip", PAGE), { wrapper: wrapperFor(() => enabled) });
    expect(mocks.usePaginatedQuery).toHaveBeenLastCalledWith(pagedRef, "skip", PAGE);
  });
});

describe("tripClientFor", () => {
  it("names its own trip on every call, whatever the view, with an explicit tripId winning", async () => {
    const client = tripClientFor(mocks.convex as never, "trip-saved");
    await client.query(queryRef, { token: "t" } as never);
    await client.mutation(mutationRef, { token: "t" } as never);
    await client.mutation(mutationRef, { token: "t", tripId: "trip-card" } as never);
    expect(mocks.query).toHaveBeenCalledWith(queryRef, { token: "t", tripId: "trip-saved" });
    expect(mocks.mutation).toHaveBeenCalledWith(mutationRef, { token: "t", tripId: "trip-saved" });
    expect(mocks.mutation).toHaveBeenLastCalledWith(mutationRef, { token: "t", tripId: "trip-card" });
  });
});
