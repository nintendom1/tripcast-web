import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import { useTicker } from "./useTicker";

const run = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: () => run,
}));

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

function hookIn(view: Partial<TripContextValue> | undefined) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    view ? <TripContextTestProvider value={view}>{children}</TripContextTestProvider> : <>{children}</>;
  return { wrapper };
}

beforeEach(() => {
  localStorage.clear();
  run.mockReset().mockResolvedValue(undefined);
  vi.mocked(convexReact.useQuery).mockReset().mockReturnValue(undefined);
});

describe("useTicker on the viewed trip", () => {
  it("reads the viewed trip's settings in private view", () => {
    renderHook(() => useTicker("tok"), hookIn(viewOf("B")));
    expect(vi.mocked(convexReact.useQuery)).toHaveBeenCalledWith(expect.anything(), { token: "tok", tripId: "B" });
  });

  it("reads exactly today's arguments with no provider and for a Follower", () => {
    renderHook(() => useTicker("tok"), hookIn(undefined));
    renderHook(
      () => useTicker("tok"),
      hookIn({ role: "follower", viewingTripId: "F", viewingTrip: { tripId: "F", title: "F" }, multiTripEnabled: false }),
    );
    const calls = vi.mocked(convexReact.useQuery).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    for (const [, args] of calls) expect(args).toEqual({ token: "tok" });
    for (const [, args] of calls) expect(Object.keys(args as object)).toEqual(["token"]);
  });

  it("writes to the trip captured when the hook mounted, not the one shown later", async () => {
    let view = viewOf("A");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TripContextTestProvider value={view}>{children}</TripContextTestProvider>
    );
    const { result, rerender } = renderHook(() => useTicker("tok"), { wrapper });
    view = viewOf("B");
    rerender();
    await act(async () => {
      await result.current.addTip("hello");
    });
    expect(run).toHaveBeenCalledWith({ token: "tok", type: "tip", text: "hello", tripId: "A" });
  });
});
