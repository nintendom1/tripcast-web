import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import AttributionBlock from "./AttributionBlock";
import AttributionPublicLine from "./AttributionPublicLine";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));

const setAttributions = vi.fn();
const queryArgs = (ref: unknown) =>
  vi.mocked(convexReact.useQuery).mock.calls.filter((c) => c[0] === ref).map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  setAttributions.mockResolvedValue(null);
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) =>
    ref === tripcastApi.attributions.travelerSetFollowerAttributions ? setAttributions : vi.fn()) as never);
});

const block = (value: Partial<TripContextValue>, viewerRole: "traveler" | "follower" = "traveler") => (
  <TripContextTestProvider value={value}>
    <AttributionBlock token="t" viewerRole={viewerRole} sourceType="story" sourceId="s1" />
  </TripContextTestProvider>
);

describe("AttributionBlock on a viewed trip", () => {
  it("reads the viewed trip and saves credits to the trip shown when editing opened", async () => {
    // Mounted while following the shared trip; the Traveler then views another trip and opens the editor.
    const { rerender } = render(block(travelerFollowingCurrent));
    rerender(block(travelerViewingPrivately));
    expect(queryArgs(tripcastApi.attributions.listAttributionsForSource).at(-1)).toMatchObject({ tripId: "trip-other" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit credits" }));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await user.click(screen.getByRole("button", { name: "Save credits" }));
    await waitFor(() =>
      expect(setAttributions).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "s1", tripId: "trip-other" })),
    );
  });

  it("sends today's requests with multi-trip disabled", async () => {
    render(block({ multiTripEnabled: false }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit credits" }));
    await user.click(screen.getByRole("button", { name: "Save credits" }));
    await waitFor(() => expect(setAttributions).toHaveBeenCalled());
    expect(Object.keys(setAttributions.mock.calls[0][0]).sort()).toEqual(["attributions", "sourceId", "sourceType", "token"]);
    expect(queryArgs(tripcastApi.attributions.listAttributionsForSource).at(-1)).toEqual({
      token: "t",
      sourceType: "story",
      sourceId: "s1",
    });
  });

  it("sends today's read for a Follower, in the block and in the public line", () => {
    render(
      <TripContextTestProvider value={{ ...travelerViewingPrivately, role: "follower" }}>
        <AttributionBlock token="t" viewerRole="follower" sourceType="story" sourceId="s1" />
        <AttributionPublicLine token="t" sourceType="story" sourceId="s1" />
      </TripContextTestProvider>,
    );
    for (const args of queryArgs(tripcastApi.attributions.listAttributionsForSource)) {
      expect(args).toEqual({ token: "t", sourceType: "story", sourceId: "s1" });
    }
  });
});
