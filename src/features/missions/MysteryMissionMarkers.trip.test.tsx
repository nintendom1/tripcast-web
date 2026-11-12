import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type MysteryMissionFeedItem } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import MysteryMissionMarkers from "../map/MysteryMissionMarkers";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../native/useNativeMysteryNarrationPlayback", () => ({
  useNativeMysteryNarrationPlayback: () => ({ state: "idle", source: "none", missionId: null }),
}));

const pin = (id: string) => ({ _id: id, state: "signal", lat: 1, lon: 2, mysteryText: id }) as unknown as MysteryMissionFeedItem;
const rowsByTrip: Record<string, MysteryMissionFeedItem[]> = {
  "trip-other": [pin("a")],
  "trip-b": [pin("a"), pin("b")],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convexReact.useQuery).mockImplementation(((ref: unknown, args: { tripId?: string } | "skip") => {
    if (args === "skip" || ref !== tripcastApi.mysteryMissions.listMysteryMissionMapPins) return undefined;
    return { rows: rowsByTrip[args.tripId ?? ""] ?? [] };
  }) as never);
});

describe("MysteryMissionMarkers with a viewed trip", () => {
  it("reads carry the viewed trip and a switched trip's pins are not announced as new", () => {
    const onSignal = vi.fn();
    const ui = <MysteryMissionMarkers map={null} token="t" onMysterySignalAppeared={onSignal} />;
    const { rerender } = render(<TripContextTestProvider value={travelerViewingPrivately}>{ui}</TripContextTestProvider>);
    expect(vi.mocked(convexReact.useQuery).mock.calls[0][1]).toEqual({ token: "t", tripId: "trip-other" });
    rerender(
      <TripContextTestProvider value={{ ...travelerViewingPrivately, viewingTripId: "trip-b", viewingTrip: { tripId: "trip-b", title: "B" } }}>
        {ui}
      </TripContextTestProvider>,
    );
    expect(onSignal).not.toHaveBeenCalled();
  });

  it("reads carry no trip with multi-trip disabled", () => {
    render(<MysteryMissionMarkers map={null} token="t" />);
    expect(vi.mocked(convexReact.useQuery).mock.calls[0][1]).toEqual({ token: "t" });
  });
});
