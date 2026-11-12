import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import MysteryMissionEditSheet from "./MysteryMissionEditSheet";
import MysteryMissionsSheet from "../options/MysteryMissionsSheet";

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

describe("MysteryMissionEditSheet given the trip its list was opened on", () => {
  const listedFrom = { tripId: "trip-listed", title: "Listed Trip" };
  const editReads = () =>
    vi.mocked(convexReact.useQuery).mock.calls
      .filter(([ref, args]) => ref === tripcastApi.mysteryMissions.travelerGetMysteryMissionForEdit && args !== "skip")
      .map(([, args]) => args);

  it("reads and writes the list's trip, whatever trip is viewed when it opens", async () => {
    const user = userEvent.setup();
    const sharedTrip = { tripId: "trip-current", title: "Current Trip", lifecycle: "in_progress" as const, isLegacy: false, revision: 1, publishingEpoch: 1, epochStartedAt: 0, multiTripEnabled: true };
    render(
      <TripContextTestProvider value={{ ...travelerFollowingCurrent, currentTrip: sharedTrip }}>
        <MysteryMissionEditSheet open token="t" mysteryMissionId="mm-1" onOpenChange={vi.fn()} tripTarget={listedFrom} />
      </TripContextTestProvider>,
    );
    expect(await screen.findByText("Listed Trip")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Save Mystery Mission" }));
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ mysteryMissionId: "mm-1", tripId: "trip-listed" }));
    expect(editReads().length).toBeGreaterThan(0);
    for (const args of editReads()) expect(args).toStrictEqual({ token: "t", mysteryMissionId: "mm-1", tripId: "trip-listed" });
  });

  it("multi-trip off (no list trip): exactly today's read and write, with no tripId", async () => {
    const user = userEvent.setup();
    render(<MysteryMissionEditSheet open token="t" mysteryMissionId="mm-1" onOpenChange={vi.fn()} tripTarget={null} />);
    await user.click(await screen.findByRole("button", { name: "Save Mystery Mission" }));
    expect(patch.mock.calls[0]?.[0]).not.toHaveProperty("tripId");
    expect(editReads().length).toBeGreaterThan(0);
    for (const args of editReads()) expect(args).toStrictEqual({ token: "t", mysteryMissionId: "mm-1" });
  });

  it("from the Mystery Missions list: a row listed from one trip is edited there after the view moved", async () => {
    const user = userEvent.setup();
    vi.mocked(convexReact.useQuery).mockImplementation(((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.mysteryMissions.travelerGetMysteryMissionForEdit) return row;
      if (ref === tripcastApi.mysteryMissions.travelerListMysteryMissions) {
        return { rows: [{ ...row, id: "signal-1" }], counts: { total: 1, active: 1, revealed: 0, dismissed: 0 } };
      }
      return undefined;
    }) as never);
    const list = (value: typeof travelerViewingPrivately) => (
      <TripContextTestProvider value={value}>
        <MysteryMissionsSheet open token="t" onOpenChange={vi.fn()} />
      </TripContextTestProvider>
    );
    const view = render(list(travelerViewingPrivately));
    view.rerender(list(travelerFollowingCurrent));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Save Mystery Mission" }));
    expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ mysteryMissionId: "mm-1", tripId: "trip-other" }));
  });
});
