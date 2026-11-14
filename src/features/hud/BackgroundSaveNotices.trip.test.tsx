import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingSave } from "../../lib/idb";
import type { BackgroundSaveNotice } from "../../providers/BackgroundSaveProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import { BackgroundSaveRetryToast } from "./BackgroundSaveRetryToast";
import { BackgroundUploadBar } from "./BackgroundUploadBar";

// The HUD reads the queue from the provider; the real `isUnplacedSave` decides which save needs the Traveler's choice.
const bg = vi.hoisted(() => ({
  saves: [] as PendingSave[],
  notices: [] as BackgroundSaveNotice[],
  retrySave: vi.fn(),
  dismissSave: vi.fn(),
  dismissNotice: vi.fn(),
}));
vi.mock("../../providers/BackgroundSaveProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../providers/BackgroundSaveProvider")>()),
  useBackgroundSave: () => bg,
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({}) }));

const DATA: PendingSave["data"] = { showInStory: true, lat: 1, lon: 2, imageSize: "medium", source: "manual", title: "Pin" };
const OTHER = { tripId: "trip-other", tripTitle: "Other Trip" };
const UNPLACED = "Couldn't tell which trip this save belongs to. Choose where to save it, or dismiss it.";

function save(patch: Partial<PendingSave>): PendingSave {
  return { id: "s1", data: DATA, status: "saving", progress: 50, createdAt: 1, retryCount: 0, ...patch };
}

const onRetry = vi.fn();
function hud(trip: Partial<TripContextValue> | null) {
  const ui = (
    <>
      <BackgroundSaveRetryToast onRetry={onRetry} />
      <BackgroundUploadBar />
    </>
  );
  return render(trip === null ? ui : <TripContextTestProvider value={trip}>{ui}</TripContextTestProvider>);
}
const tripLine = () => screen.queryByTestId("bg-save-trip");

beforeEach(() => {
  vi.clearAllMocks();
  bg.saves = [];
  bg.notices = [];
});

describe("background save HUD with trips", () => {
  it("the upload bar names a save's trip only while another trip is on screen", () => {
    bg.saves = [save(OTHER)];
    const view = hud(travelerFollowingCurrent);
    expect(tripLine()).toHaveTextContent("Other Trip");
    view.rerender(
      <TripContextTestProvider value={travelerViewingPrivately}>
        <BackgroundUploadBar />
      </TripContextTestProvider>,
    );
    expect(tripLine()).toBeNull();
  });

  it("the failure toast names a save's trip when it is not on screen", () => {
    bg.saves = [save({ ...OTHER, status: "failed", error: "offline" })];
    hud(travelerFollowingCurrent);
    expect(tripLine()).toHaveTextContent("Other Trip");
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  });

  it("shows a save dropped because its trip was deleted, with a dismiss, even with no failed save", async () => {
    bg.notices = [{ id: "n1", message: "A save for Old Trip was removed because that trip no longer exists." }];
    hud(travelerFollowingCurrent);
    expect(screen.getByRole("status")).toHaveTextContent("A save for Old Trip was removed");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(bg.dismissNotice).toHaveBeenCalledWith("n1");
  });

  it("a save that couldn't be placed offers only the trip on screen, by name, and sends it there when chosen", async () => {
    bg.saves = [save({ id: "old", status: "failed", error: UNPLACED })];
    hud(travelerViewingPrivately);
    expect(screen.queryByRole("button", { name: /^Retry/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save to Other Trip" }));
    expect(bg.retrySave).toHaveBeenCalledWith("old", travelerViewingPrivately.viewingTrip);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("other failed saves still go to the map's Retry", async () => {
    bg.saves = [save({ ...OTHER, status: "failed", error: "offline" })];
    hud(travelerFollowingCurrent);
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledWith(bg.saves[0]);
    expect(bg.retrySave).not.toHaveBeenCalled();
  });

  it("nothing new with multi-trip off, for a Follower or without a provider: no trip line, plain Retry", () => {
    for (const trip of [{}, { ...travelerFollowingCurrent, role: "follower" as const }, null]) {
      bg.saves = [save({ id: "a", status: "failed", error: UNPLACED }), save({ ...OTHER, id: "b" })];
      const view = hud(trip);
      expect(tripLine()).toBeNull();
      expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Save to/ })).toBeNull();
      view.unmount();
    }
  });
});
