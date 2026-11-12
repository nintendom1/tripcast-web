import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import AutoStateTab, { type AutoStateFooterAction } from "./AutoStateTab";

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
const onCurrent: Partial<TripContextValue> = { ...travelerFollowingCurrent, currentTrip: CURRENT };
const onOther: Partial<TripContextValue> = { ...travelerViewingPrivately, currentTrip: CURRENT };

const autoState = {
  autoStateEnabled: true,
  autoEnabledAt: Date.UTC(2024, 5, 15, 0, 0, 0),
  autoTimeZone: "UTC",
  autoBaseEnergyScore: 60,
  autoBaseStomachScore: 80,
  autoBedtimeMinutes: 23 * 60,
  autoWakeTimeMinutes: 9 * 60,
  autoEnergyMin: 0,
  autoEnergyMax: 100,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnergySleepDeltaPerTick: 1,
  autoEnergyAwakeDeltaPerTick: -1,
  autoStomachAwakeDeltaPerTick: -2,
  autoStomachNightAboveHungryEveryTicks: 2,
  autoStomachNightAtOrBelowHungryEveryTicks: 4,
  updatedAt: Date.UTC(2024, 5, 15, 0, 0, 0),
  updatedBySessionId: null,
};

const setEnabled = vi.fn();
const updateSettings = vi.fn();
const updateState = vi.fn();
let footer: AutoStateFooterAction | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  footer = null;
  for (const fn of [setEnabled, updateSettings, updateState]) fn.mockResolvedValue(null);
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) =>
    ref === tripcastApi.travelerAutoState.travelerGetAutoState ? autoState : undefined,
  );
  vi.mocked(convexReact.useMutation).mockImplementation(((ref: unknown) => {
    if (ref === tripcastApi.travelerAutoState.travelerSetAutoStateEnabled) return setEnabled;
    if (ref === tripcastApi.travelerAutoState.travelerUpdateAutoStateSettings) return updateSettings;
    if (ref === tripcastApi.travelerState.travelerUpdateState) return updateState;
    return vi.fn().mockResolvedValue(null);
  }) as never);
});

const tab = (value: Partial<TripContextValue>) => (
  <TripContextTestProvider value={value}>
    <AutoStateTab token="t" onFooterActionChange={(action) => (footer = action)} />
  </TripContextTestProvider>
);

describe("AutoStateTab on a viewed trip", () => {
  it("changes automatic state on the shared current trip", async () => {
    render(tab(onCurrent));
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeEnabled();
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, tripId: "trip-current" })));
    expect(footer?.disabled).toBe(false);
  });

  it("makes every automatic-state action unavailable, with the reason, on another trip", async () => {
    render(tab(onOther));
    expect(screen.getByTestId("trip-target-label")).toHaveTextContent("Other Trip");
    expect(screen.getByText(/Return to Current Trip to change automatic state/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Apply estimate to saved State/ })).toBeDisabled();
    expect(footer?.disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole("switch"));
    footer?.onSave();
    expect(setEnabled).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(updateState).not.toHaveBeenCalled();
  });

  it("makes the time zone rebase unavailable on another trip", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) =>
      ref === tripcastApi.travelerAutoState.travelerGetAutoState ? { ...autoState, autoTimeZone: "Pacific/Kiritimati" } : undefined,
    );
    const { rerender } = render(tab(onCurrent));
    expect(screen.getByRole("button", { name: /Rebase/ })).toBeEnabled();
    rerender(tab(onOther));
    // Opened on the shared trip, so still enabled; a fresh mount on the other trip is disabled.
    expect(screen.getByRole("button", { name: /Rebase/ })).toBeEnabled();
    render(tab(onOther));
    expect(screen.getAllByRole("button", { name: /Rebase/ }).at(-1)).toBeDisabled();
  });

  it("decides from the trip it was opened on, not the trip on screen later", () => {
    const { rerender } = render(tab(onOther));
    rerender(tab(onCurrent));
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("sends today's requests with multi-trip disabled", async () => {
    render(tab({ multiTripEnabled: false }));
    await userEvent.setup().click(screen.getByRole("switch"));
    await waitFor(() => expect(setEnabled).toHaveBeenCalled());
    expect(setEnabled.mock.calls[0][0]).not.toHaveProperty("tripId");
  });
});
