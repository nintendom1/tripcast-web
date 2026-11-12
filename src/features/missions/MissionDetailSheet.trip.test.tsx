import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { CurrentTrip, Mission } from "../../convex/tripcastApi";
import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { renderWithTrip, travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import MissionDetailSheet from "./MissionDetailSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../travelfunds/LinkedTransactionsSection", () => ({
  default: () => <div data-testid="linked-transactions-mock" />,
}));

const mission: Mission = {
  _id: "mission-1",
  title: "Mission",
  status: "planned",
  source: "traveler",
  createdAt: 1,
  updatedAt: 1,
};

function currentTrip(lifecycle: CurrentTrip["lifecycle"] = "in_progress"): CurrentTrip {
  return {
    tripId: "trip-current",
    title: "Current Trip",
    lifecycle,
    isLegacy: false,
    revision: 1,
    publishingEpoch: 1,
    epochStartedAt: 1,
    multiTripEnabled: true,
  };
}

const privateView: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: currentTrip() };
const followingCurrent: Partial<TripContextValue> = {
  role: "traveler",
  multiTripEnabled: true,
  viewingMode: "follow_current",
  viewingTripId: "trip-current",
  viewingTrip: { tripId: "trip-current", title: "Current Trip" },
  currentTrip: currentTrip(),
};

const mutate = vi.fn();
const sheet = <MissionDetailSheet Mission={mission} token="t" role="traveler" onClose={vi.fn()} />;

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockResolvedValue(null);
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
  vi.mocked(convexReact.useMutation).mockReturnValue(mutate as never);
});

function missionReadArgs() {
  const call = vi.mocked(convexReact.useQuery).mock.calls.find(([ref]) => ref === tripcastApi.missions.getMission);
  return call?.[1];
}

describe("MissionDetailSheet with a viewed trip", () => {
  it("reads carry the viewed trip in private view", () => {
    renderWithTrip(sheet, { trip: privateView });
    expect(missionReadArgs()).toEqual({ token: "t", missionId: "mission-1", tripId: "trip-other" });
  });

  it("reads carry no trip with multi-trip disabled (no provider)", () => {
    render(sheet);
    expect(missionReadArgs()).toEqual({ token: "t", missionId: "mission-1" });
  });

  it("a write still goes to the trip captured at mount after the view changes", async () => {
    const user = userEvent.setup();
    const proposed: Mission = { ...mission, status: "proposed" };
    const ui = <MissionDetailSheet Mission={proposed} token="t" role="traveler" onClose={vi.fn()} />;
    const { rerender } = render(<TripContextTestProvider value={privateView}>{ui}</TripContextTestProvider>);
    rerender(
      <TripContextTestProvider value={{ ...privateView, viewingTripId: "trip-third", viewingTrip: { tripId: "trip-third", title: "Third" } }}>
        {ui}
      </TripContextTestProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Delete silently" }));
    expect(screen.getByText(/permanently deletes the Mission from Other Trip/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, delete from Other Trip" }));
    expect(mutate).toHaveBeenCalledWith({ token: "t", missionId: "mission-1", tripId: "trip-other" });
  });

  it("starting a mission is unavailable in private view, with a reason", () => {
    renderWithTrip(sheet, { trip: privateView });
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeDisabled();
    expect(screen.getByText("Return to Current Trip to start a mission")).toBeInTheDocument();
  });

  it("starting a mission is available on the shared current trip while it is in progress", () => {
    renderWithTrip(sheet, { trip: followingCurrent });
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeEnabled();
  });

  it("starting a mission is unavailable when the current trip is not in progress", () => {
    renderWithTrip(sheet, { trip: { ...followingCurrent, currentTrip: currentTrip("completed") } });
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeDisabled();
  });

  it("starting a mission is unchanged with multi-trip disabled", () => {
    render(sheet);
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeEnabled();
  });

  it("the start gate follows the trip the write goes to, not the current view", () => {
    const { rerender } = render(<TripContextTestProvider value={privateView}>{sheet}</TripContextTestProvider>);
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeDisabled();
    // Back on the shared trip without closing: the open sheet still writes to trip-other, so it stays disabled.
    rerender(<TripContextTestProvider value={followingCurrent}>{sheet}</TripContextTestProvider>);
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeDisabled();
    expect(screen.getByText("Return to Current Trip to start a mission")).toBeInTheDocument();
  });

  it("a privately viewed trip that becomes the shared current trip can start missions", () => {
    const becameShared = { ...privateView, currentTrip: { ...currentTrip(), tripId: "trip-other", title: "Other Trip" } };
    renderWithTrip(sheet, { trip: becameShared });
    expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeEnabled();
  });

  it("the manual status override to in progress is gated like Start", async () => {
    const user = userEvent.setup();
    renderWithTrip(sheet, { trip: privateView });
    await user.click(screen.getByRole("button", { name: "Change status manually" }));
    await user.selectOptions(screen.getByRole("combobox"), "in_progress");
    expect(screen.getByRole("button", { name: "Apply status" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox"), "completed");
    expect(screen.getByRole("button", { name: "Apply status" })).toBeEnabled();
  });

  it("Set Current Activity is disabled with a reason off the shared trip", () => {
    const active: Mission = { ...mission, status: "in_progress" };
    renderWithTrip(<MissionDetailSheet Mission={active} token="t" role="traveler" onClose={vi.fn()} />, { trip: privateView });
    expect(screen.getByRole("button", { name: "Set Current Activity to This Mission" })).toBeDisabled();
    expect(screen.getByText("Return to Current Trip to set the current activity")).toBeInTheDocument();
  });

  it("Set Current Activity is enabled on the shared trip", () => {
    const active: Mission = { ...mission, status: "in_progress" };
    renderWithTrip(<MissionDetailSheet Mission={active} token="t" role="traveler" onClose={vi.fn()} />, { trip: followingCurrent });
    expect(screen.getByRole("button", { name: "Set Current Activity to This Mission" })).toBeEnabled();
  });

  it("a Follower's request carries no trip and the Follower can still withdraw", async () => {
    const user = userEvent.setup();
    const proposed: Mission = { ...mission, status: "proposed", source: "follower" };
    renderWithTrip(
      <MissionDetailSheet Mission={proposed} token="t" role="follower" isOwn onClose={vi.fn()} />,
      { trip: { role: "follower", viewingTripId: "trip-current", viewingTrip: { tripId: "trip-current", title: "Current Trip" } } },
    );
    expect(missionReadArgs()).toEqual({ token: "t", missionId: "mission-1" });
    await user.click(screen.getByRole("button", { name: /Withdraw/i }));
    expect(mutate).toHaveBeenCalledWith({ token: "t", missionId: "mission-1" });
  });
});
