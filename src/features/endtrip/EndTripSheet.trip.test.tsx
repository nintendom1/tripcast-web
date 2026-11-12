import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { CurrentTrip, TripCredits } from "../../convex/tripcastApi";
import { getLiveSharingEnabled, setLiveSharingEnabled } from "../../lib/liveSharingPreference";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import EndTripSheet from "./EndTripSheet";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));

const CURRENT: CurrentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
};
const credits: TripCredits = {
  ended: false,
  travelerName: "The Traveler",
  followers: [],
  leaderboard: [],
  totals: { points: 0, badges: 0, followers: 0 },
};
const onCurrent: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: CURRENT };
const onOther: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: CURRENT };
// A privately viewed trip that has become the shared current trip while it is on screen.
const privateButShared: Partial<TripContextValue> = {
  ...travelerViewingPrivately,
  viewingTripId: "trip-current",
  viewingTrip: { tripId: "trip-current", title: "Current Trip" },
  currentTrip: CURRENT,
};

const endTrip = vi.fn();
const reopenTrip = vi.fn();
const creditsArgs = () =>
  vi.mocked(convexReact.useQuery).mock.calls.map((call) => call[1] as unknown).filter((a) => a !== "skip") as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  endTrip.mockResolvedValue(null);
  reopenTrip.mockResolvedValue(null);
  setLiveSharingEnabled(true);
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) =>
    ref === tripcastApi.endTrip.travelerEndTrip ? endTrip : reopenTrip) as never);
  vi.mocked(convexReact.useQuery).mockReturnValue(credits as never);
});

const sheet = (open: boolean) => <EndTripSheet token="t" open={open} onOpenChange={vi.fn()} onViewCredits={vi.fn()} />;
const inContext = (value: Partial<TripContextValue>, open = true) => (
  <TripContextTestProvider value={value}>{sheet(open)}</TripContextTestProvider>
);
const end = async () => {
  await userEvent.setup().click(screen.getByRole("button", { name: /End trip & roll credits/i }));
};

describe("EndTripSheet with trips", () => {
  it("ends the shared current trip and stops this device's live sharing", async () => {
    render(inContext(onCurrent));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalledWith({ token: "t", thankYouNote: undefined, tripId: "trip-current" }));
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("stops live sharing by trip id when the privately viewed trip is the shared one", async () => {
    render(inContext(privateButShared));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalled());
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("ends a privately viewed trip that is not shared without touching sharing", async () => {
    render(inContext(onOther));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" })));
    expect(getLiveSharingEnabled()).toBe(true);
  });

  it("does not stop sharing when the End Trip call fails", async () => {
    endTrip.mockRejectedValue(new Error("nope"));
    render(inContext(onCurrent));
    await end();
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
    expect(getLiveSharingEnabled()).toBe(true);
  });

  it("targets the trip shown when it opens, and reads that trip's credits", async () => {
    // Mounted closed while following the shared trip; the Traveler then views another trip and opens it.
    const { rerender } = render(inContext(onCurrent, false));
    rerender(inContext(onOther, false));
    rerender(inContext(onOther, true));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" })));
    expect(creditsArgs().at(-1)).toMatchObject({ token: "t", tripId: "trip-other" });
    expect(getLiveSharingEnabled()).toBe(true);
  });

  it("keeps the trip it opened on when the view changes while open", async () => {
    const { rerender } = render(inContext(onOther));
    rerender(inContext(onCurrent));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-other" })));
  });

  it("reopens the trip it was opened for", async () => {
    vi.mocked(convexReact.useQuery).mockReturnValue({ ...credits, ended: true } as never);
    render(inContext(onOther));
    await userEvent.setup().click(screen.getByRole("button", { name: /Reopen trip/i }));
    await waitFor(() => expect(reopenTrip).toHaveBeenCalledWith({ token: "t", tripId: "trip-other" }));
  });

  it("reports a deleted trip to the context", async () => {
    const reportTripUnavailable = vi.fn();
    endTrip.mockRejectedValue({ data: { code: "trip_not_found", message: "gone" } });
    render(inContext({ ...onOther, reportTripUnavailable }));
    await end();
    await waitFor(() => expect(reportTripUnavailable).toHaveBeenCalledWith("trip-other"));
  });

  it("sends exactly today's requests with multi-trip disabled and leaves sharing alone", async () => {
    render(inContext({ multiTripEnabled: false }));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalled());
    expect(Object.keys(endTrip.mock.calls[0][0]).sort()).toEqual(["thankYouNote", "token"]);
    expect(creditsArgs().at(-1)).toEqual({ token: "t" });
    expect(getLiveSharingEnabled()).toBe(true);
  });

  it("sends exactly today's requests with no provider", async () => {
    render(sheet(true));
    await end();
    await waitFor(() => expect(endTrip).toHaveBeenCalled());
    expect(Object.keys(endTrip.mock.calls[0][0]).sort()).toEqual(["thankYouNote", "token"]);
    expect(creditsArgs().at(-1)).toEqual({ token: "t" });
  });
});
