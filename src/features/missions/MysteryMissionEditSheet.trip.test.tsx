import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import MysteryMissionEditSheet from "./MysteryMissionEditSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const row = {
  _id: "mm-1",
  lat: 1,
  lon: 2,
  mysteryText: "text",
  trueIntent: "intent",
  spawnRadiusMiles: 30,
  resolveRadiusMeters: 75,
  priority: 0,
};
const patch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue(null);
  vi.mocked(convexReact.useMutation).mockReturnValue(patch as never);
  vi.mocked(convexReact.useQuery).mockImplementation(((ref: unknown, args: unknown) =>
    args !== "skip" && ref === tripcastApi.mysteryMissions.travelerGetMysteryMissionForEdit ? row : undefined) as never);
});

const sheet = (open: boolean) => (
  <MysteryMissionEditSheet open={open} token="t" mysteryMissionId="mm-1" onOpenChange={vi.fn()} />
);

describe("MysteryMissionEditSheet with a viewed trip", () => {
  it("writes to the trip viewed when it opened, not the one viewed when it mounted", async () => {
    const user = userEvent.setup();
    // Mounted closed while following the shared trip, then the Traveler views another trip and opens the editor.
    const { rerender } = render(<TripContextTestProvider value={travelerFollowingCurrent}>{sheet(false)}</TripContextTestProvider>);
    rerender(<TripContextTestProvider value={travelerViewingPrivately}>{sheet(false)}</TripContextTestProvider>);
    rerender(<TripContextTestProvider value={travelerViewingPrivately}>{sheet(true)}</TripContextTestProvider>);
    expect(await screen.findByText("Other Trip")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Save Mystery Mission" }));
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ mysteryMissionId: "mm-1", tripId: "trip-other" }));
  });

  it("keeps the trip it opened on when the view changes while open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TripContextTestProvider value={travelerViewingPrivately}>{sheet(true)}</TripContextTestProvider>);
    rerender(<TripContextTestProvider value={travelerFollowingCurrent}>{sheet(true)}</TripContextTestProvider>);
    await user.click(await screen.findByRole("button", { name: "Save Mystery Mission" }));
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" }));
  });
});
