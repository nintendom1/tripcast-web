import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConvex } from "convex/react";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import { useImagePrefetch } from "./useImagePrefetch";

vi.mock("convex/react", () => ({ useConvex: vi.fn() }));
vi.mock("../../debug/debugLogger", () => ({ logMapEvent: vi.fn() }));

class FakeImage {
  onload?: () => void;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

let query: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
  query = vi.fn(async (_ref: unknown, args: { imageId: string }) => `https://img/${args.imageId}.jpg`);
  vi.mocked(useConvex).mockReturnValue({ query } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useImagePrefetch follows the viewed trip", () => {
  it("never queries the new trip's image ids with the old trip, even for one pass", async () => {
    let view = viewOf("A");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TripContextTestProvider value={view}>{children}</TripContextTestProvider>
    );
    const { rerender } = renderHook(({ ids }: { ids: string[] }) => useImagePrefetch("tok", ids), {
      wrapper,
      initialProps: { ids: ["a"] },
    });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(query.mock.calls[0][1]).toEqual({ token: "tok", imageId: "a", tripId: "A" });

    // The view and the image ids change in the same render (the other trip's Stories arrive).
    view = viewOf("B");
    rerender({ ids: ["b"] });
    await waitFor(() => expect(query.mock.calls.some(([, args]) => args.imageId === "b")).toBe(true));

    const forB = query.mock.calls.filter(([, args]) => args.imageId === "b");
    expect(forB).toHaveLength(1); // one pass only: no failed pass with the old trip, no retry
    expect(forB[0][1]).toEqual({ token: "tok", imageId: "b", tripId: "B" });
  });

  it("sends exactly today's arguments with no provider", async () => {
    renderHook(() => useImagePrefetch("tok", ["a"]));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(query.mock.calls[0][1]).toEqual({ token: "tok", imageId: "a" });
    expect(Object.keys(query.mock.calls[0][1])).toEqual(["token", "imageId"]);
  });
});
