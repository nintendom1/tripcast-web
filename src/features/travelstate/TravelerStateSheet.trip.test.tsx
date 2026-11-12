import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import TravelerStateSheet from "./TravelerStateSheet";

vi.mock("convex/react", () => ({ useMutation: vi.fn(), useQuery: vi.fn() }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div> },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

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
const onCurrent: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: CURRENT };
const onOther: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: CURRENT };
const onPlanned: Partial<TripContextValue> = { ...onCurrent, currentTrip: { ...CURRENT, lifecycle: "planned" } };
const privateButShared: Partial<TripContextValue> = {
  ...travelerViewingPrivately,
  viewingTripId: "trip-current",
  viewingTrip: { tripId: "trip-current", title: "Current Trip" },
  currentTrip: CURRENT,
};

const updateState = vi.fn();
const setActivity = vi.fn();
const queryArgs = (ref: unknown) =>
  vi.mocked(convexReact.useQuery).mock.calls.filter((c) => c[0] === ref).map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  updateState.mockResolvedValue(null);
  setActivity.mockResolvedValue("a-1");
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerGetState) return { state: null, visibility: null };
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) => {
    if (ref === tripcastApi.travelerState.travelerUpdateState) return updateState;
    if (ref === tripcastApi.currentActivity.travelerSetCurrentActivity) return setActivity;
    return vi.fn().mockResolvedValue(null);
  }) as never);
});

const sheet = () => <TravelerStateSheet token="t" onClose={vi.fn()} onToast={vi.fn()} />;
const inContext = (value: Partial<TripContextValue>) => (
  <TripContextTestProvider value={value}>{sheet()}</TripContextTestProvider>
);
const saveButton = () => screen.getByRole("button", { name: /Save Status/ });

describe("TravelerStateSheet on a viewed trip", () => {
  it("reads the viewed trip and saves the current state to the shared current trip", async () => {
    render(inContext(onCurrent));
    expect(queryArgs(tripcastApi.travelerState.travelerGetState).at(-1)).toEqual({ token: "t", tripId: "trip-current" });
    expect(saveButton()).toBeEnabled();
    await userEvent.setup().click(saveButton());
    await waitFor(() => expect(updateState).toHaveBeenCalledWith(expect.objectContaining({ tripId: "trip-current" })));
  });

  it("makes the current state unavailable, with the reason, on a trip that is not the shared one", async () => {
    render(inContext(onOther));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    expect(saveButton()).toBeDisabled();
    expect(screen.getAllByText(/Return to Current Trip to update your current state/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Activity")).toBeDisabled();
    expect(screen.getByLabelText("Emoji")).toBeDisabled();
    // Every quick-activity chip is disabled too (they sit before the Emoji field in the Current Activity segment).
    const chips = screen.getAllByRole("button").filter((b) => b.className.includes("rounded-full") && b.className.includes("truncate"));
    expect(chips.length).toBeGreaterThan(0);
    chips.forEach((chip) => expect(chip).toBeDisabled());
    await userEvent.setup().click(saveButton());
    expect(updateState).not.toHaveBeenCalled();
    expect(setActivity).not.toHaveBeenCalled();
  });

  it("still saves a past entry on that other trip, without touching the current activity", async () => {
    render(inContext(onOther));
    const when = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(when, { target: { value: "2020-01-02T03:04" } });
    expect(saveButton()).toBeEnabled();
    await userEvent.setup().click(saveButton());
    await waitFor(() =>
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-other", stateAt: new Date("2020-01-02T03:04").getTime() }),
      ),
    );
    expect(setActivity).not.toHaveBeenCalled();
  });

  it("is unavailable when the shared current trip is not in progress", () => {
    render(inContext(onPlanned));
    expect(saveButton()).toBeDisabled();
    expect(screen.getAllByText(/Current Trip isn't in progress/).length).toBeGreaterThan(0);
  });

  it("decides from trip ids: a privately viewed trip that is the shared one stays available", () => {
    render(inContext(privateButShared));
    expect(saveButton()).toBeEnabled();
  });

  it("decides from the trip it was opened on, not the trip on screen later", () => {
    const { rerender } = render(inContext(onOther));
    rerender(inContext(onCurrent));
    expect(saveButton()).toBeDisabled();
  });

  it("sends today's requests with multi-trip disabled, and for a Follower-style context with no trip", async () => {
    render(inContext({ multiTripEnabled: false }));
    expect(queryArgs(tripcastApi.travelerState.travelerGetState).at(-1)).toEqual({ token: "t" });
    expect(saveButton()).toBeEnabled();
    await userEvent.setup().click(saveButton());
    await waitFor(() => expect(updateState).toHaveBeenCalled());
    expect(updateState.mock.calls[0][0]).not.toHaveProperty("tripId");
  });
});
