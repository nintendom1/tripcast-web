import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type CurrentTrip } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { StatusCardConnected } from "./StatusCardConnected";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const NOW = Date.UTC(2024, 0, 1, 20, 7, 0);
const FOUR_HOURS = 4 * 60 * 60 * 1000;

const SHARED = "trip-shared";
const OTHER = "trip-other";

const current = (tripId = SHARED): CurrentTrip => ({
  tripId,
  title: "Shared Trip",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
});

/** A Traveler with multi-trip on whose shared current trip is `shared` while `viewing` is on screen. */
const viewing = (viewingId: string, shared = SHARED): Partial<TripContextValue> => ({
  role: "traveler",
  multiTripEnabled: true,
  currentTrip: current(shared),
  viewingMode: viewingId === shared ? "follow_current" : "private",
  viewingTripId: viewingId,
  viewingTrip: { tripId: viewingId, title: viewingId },
});

const autoState = {
  autoStateEnabled: true,
  autoEnabledAt: NOW - FOUR_HOURS,
  autoTimeZone: "UTC",
  autoBaseEnergyScore: 60,
  autoBaseStomachScore: 80,
  autoBedtimeMinutes: 23 * 60,
  autoWakeTimeMinutes: 8 * 60,
  autoEnergyMin: 0,
  autoEnergyMax: 100,
  autoStomachMin: 0,
  autoStomachMax: 150,
  autoEnergySleepDeltaPerTick: 1,
  autoEnergyAwakeDeltaPerTick: -1,
  autoStomachAwakeDeltaPerTick: -2,
  autoStomachNightAboveHungryEveryTicks: 2,
  autoStomachNightAtOrBelowHungryEveryTicks: 4,
  updatedAt: NOW,
  updatedBySessionId: "s",
};

const savedState = {
  state: { energyScore: 60, stomachScore: 80, stressScore: 20, updatedAt: NOW - FOUR_HOURS },
  visibility: null,
};

const activity = { _id: "a1", title: "Museum", status: "active", startedAt: NOW - 2 * 60 * 60 * 1000 };

type Prefs = Record<string, unknown> | undefined;

/** Per-trip preferences: `byTrip[tripId]` answers a call that names that trip, `own` answers the rest. */
function mockQueries({ own, byTrip = {} }: { own?: Prefs; byTrip?: Record<string, Prefs> }) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: any) => {
    if (args === "skip") return undefined;
    if (ref === tripcastApi.travelerState.travelerGetState) return savedState;
    if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return activity;
    if (ref === tripcastApi.travelerAutoState.travelerGetAutoState) return autoState;
    if (ref === tripcastApi.travelerPreferences.travelerGetPreferences) {
      if (args?.tripId && args.tripId in byTrip) return byTrip[args.tripId];
      return own;
    }
    return null;
  });
}

const tokyo = { travelerTimeZone: "Asia/Tokyo", updatedAt: NOW };
const noZone = { updatedAt: null };

let ensureTimeZone: ReturnType<typeof vi.fn>;

function card(value?: Partial<TripContextValue>) {
  const ui = (v?: Partial<TripContextValue>) => (
    <TripContextTestProvider value={v}>
      <StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />
    </TripContextTestProvider>
  );
  const view = render(ui(value));
  return { rerender: (v?: Partial<TripContextValue>) => view.rerender(ui(v)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  ensureTimeZone = vi.fn().mockResolvedValue({ updated: true });
  vi.mocked(convexReact.useMutation).mockReturnValue(ensureTimeZone as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("status card live values (private view)", () => {
  it("shows the stored state, no clock and no elapsed times while viewing another trip privately", () => {
    mockQueries({ own: tokyo });
    card(viewing(OTHER));

    // Stored energy / fullness, not the Auto State estimate walked forward to now.
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getAllByText("80%")).toHaveLength(2); // fullness 80, calm 100 - 20
    expect(screen.queryByText("5:07 AM")).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^for /)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved status, not live/)).toBeInTheDocument();
  });

  it("shows the estimated values, the clock and the elapsed times for the shared current trip", () => {
    mockQueries({ own: tokyo });
    card(viewing(SHARED));

    expect(screen.queryByText("60%")).not.toBeInTheDocument();
    expect(screen.getByText("5:07 AM")).toBeInTheDocument();
    expect(screen.getByText(/for 2h/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved status, not live/)).not.toBeInTheDocument();
  });

  it("is live when no provider is mounted", () => {
    mockQueries({ own: tokyo });
    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);
    expect(screen.getByText("5:07 AM")).toBeInTheDocument();
    expect(screen.queryByText(/Saved status, not live/)).not.toBeInTheDocument();
  });
});

describe("ensureTimeZone names the shared current trip on both sides", () => {
  it("does not write when the shared trip has a time zone, even if the viewed trip has none", () => {
    mockQueries({ own: noZone, byTrip: { [SHARED]: tokyo } });
    card(viewing(OTHER));
    expect(ensureTimeZone).not.toHaveBeenCalled();
  });

  it("writes to the shared trip when it has none, even if the viewed trip has a time zone", () => {
    mockQueries({ own: tokyo, byTrip: { [SHARED]: noZone } });
    card(viewing(OTHER));
    expect(ensureTimeZone).toHaveBeenCalledTimes(1);
    expect(ensureTimeZone).toHaveBeenCalledWith(expect.objectContaining({ token: "token", tripId: SHARED }));
  });

  it("writes to the viewed trip when it is the shared one, with no second preferences read", () => {
    mockQueries({ own: noZone });
    card(viewing(SHARED));
    expect(ensureTimeZone).toHaveBeenCalledWith(expect.objectContaining({ tripId: SHARED }));
    const reads = vi
      .mocked(convexReact.useQuery)
      .mock.calls.filter(([ref, args]) => ref === tripcastApi.travelerPreferences.travelerGetPreferences && args !== "skip");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(([, args]) => (args as { tripId?: string }).tripId === SHARED)).toBe(true);
  });

  it("includes the trip in the attempt key: a later shared trip is tried once, the same one is not retried", () => {
    mockQueries({ own: noZone, byTrip: { "trip-next": noZone, [SHARED]: noZone } });
    const view = card(viewing(OTHER));
    expect(ensureTimeZone).toHaveBeenCalledTimes(1);

    view.rerender(viewing(OTHER));
    expect(ensureTimeZone).toHaveBeenCalledTimes(1);

    view.rerender(viewing(OTHER, "trip-next"));
    expect(ensureTimeZone).toHaveBeenCalledTimes(2);
    expect(ensureTimeZone).toHaveBeenLastCalledWith(expect.objectContaining({ tripId: "trip-next" }));
  });

  it("sends exactly today's arguments (no tripId key) with no provider and with multi-trip disabled", () => {
    mockQueries({ own: noZone });
    render(<StatusCardConnected token="token" role="traveler" onOpenState={vi.fn()} />);
    card({ role: "traveler", multiTripEnabled: false, currentTrip: current(), viewingTripId: null, viewingTrip: null });

    expect(ensureTimeZone).toHaveBeenCalledTimes(2);
    for (const [args] of ensureTimeZone.mock.calls) {
      expect(Object.keys(args).sort()).toEqual(["source", "timeZone", "token"]);
    }
  });
});
