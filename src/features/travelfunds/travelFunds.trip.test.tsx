import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type CurrentTrip } from "../../convex/tripcastApi";
import { useTripMutation } from "../../convex/useTrip";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import { FundsCompactConnected } from "../hud/FundsCompactConnected";
import type { TripContextValue } from "../trips/tripTypes";
import TravelFundsSheet from "./TravelFundsSheet";
import TransactionForm from "./TransactionForm";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

// A row's swipe-to-delete is a gesture; the test only needs its Delete action.
vi.mock("../../components/ui/SwipeRow", () => ({
  SwipeRow: ({ children, onDelete }: { children: React.ReactNode; onDelete?: () => void }) => (
    <div>
      {children}
      <button type="button" onClick={onDelete}>
        swipe delete
      </button>
    </div>
  ),
}));

vi.mock("../../providers/MusicProvider", () => ({
  useMusicSafe: () => ({ sfx: vi.fn() }),
}));

vi.mock("../../debug/useActiveUiContext", () => ({
  useActiveUiContext: vi.fn(),
}));

vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: () => ({ logFunds: vi.fn(), logInteraction: vi.fn(), logMutation: vi.fn(), error: vi.fn() }),
}));

const OTHER = { tripId: "trip-other", title: "Other Trip" };
const CURRENT = { tripId: "trip-current", title: "Current Trip" };

const config = { enabled: true, startingBudgetUsd: 1000, spentUsd: 0, remainingUsd: 1000, budgetLabel: "Other Trip" };

beforeEach(() => {
  vi.clearAllMocks();
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerGetConfig) return config;
    if (ref === tripcastApi.travelFunds.travelerListTransactions) return [];
    return undefined;
  });
  vi.mocked(convexReact.useMutation).mockImplementation(() => vi.fn().mockResolvedValue(null) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Travel Funds on the viewed trip (private view)", () => {
  it("reads the funds config and the transactions of the viewed trip", () => {
    render(
      <TripContextTestProvider value={travelerViewingPrivately}>
        <TravelFundsSheet token="test-token" onClose={vi.fn()} />
      </TripContextTestProvider>,
    );
    // Refs compare equal under toHaveBeenCalledWith (they are proxies), so pick each call out by identity: a plain
    // `useQuery` for the transactions would send `{ token }` and fail here.
    for (const ref of [tripcastApi.travelFunds.travelerGetConfig, tripcastApi.travelFunds.travelerListTransactions]) {
      const calls = vi.mocked(convexReact.useQuery).mock.calls.filter(([called]) => called === ref);
      expect(calls.length).toBeGreaterThan(0);
      for (const [, args] of calls) expect(args).toMatchObject({ tripId: OTHER.tripId });
    }
  });

  it("sends no tripId when multi-trip is disabled", () => {
    render(<TravelFundsSheet token="test-token" onClose={vi.fn()} />);
    const calls = vi.mocked(convexReact.useQuery).mock.calls.filter(([ref]) => ref === tripcastApi.travelFunds.travelerListTransactions);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).toEqual({ token: "test-token" });
  });

  it("a Follower's converted funds read sends exactly the arguments it sent before", () => {
    render(
      <TripContextTestProvider
        value={{ role: "follower", multiTripEnabled: false, viewingTripId: "trip-followed", viewingTrip: { tripId: "trip-followed", title: "Followed" } }}
      >
        <FundsCompactConnected token="tok" role="follower" />
      </TripContextTestProvider>,
    );
    const calls = vi.mocked(convexReact.useQuery).mock.calls.filter(([ref]) => ref === tripcastApi.travelFunds.followerGetFundsSummary);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) {
      expect(Object.keys(args as object).sort()).toEqual(["currentLocalDayStart", "token"]);
    }
  });

  it("the funds chip of a Traveler in private view reads the viewed trip", () => {
    render(
      <TripContextTestProvider value={travelerViewingPrivately}>
        <FundsCompactConnected token="tok" role="traveler" />
      </TripContextTestProvider>,
    );
    const calls = vi.mocked(convexReact.useQuery).mock.calls.filter(([ref]) => ref === tripcastApi.travelFunds.travelerGetConfig);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, args] of calls) expect(args).toMatchObject({ tripId: OTHER.tripId });
  });

  it("names the trip in the expense delete confirmation and labels the form", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDelete = vi.fn();
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);
    render(
      <TripContextTestProvider value={travelerViewingPrivately}>
        <TransactionForm
          token="test-token"
          mode="edit"
          target={OTHER}
          initial={{ _id: "tx1", title: "Dinner", category: "food", currencyCode: "USD", localAmount: 10, localCurrencyPerUsd: 1, countsTowardMeter: true, visibility: "public", occurredAt: 0 } as any}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          onDelete={onDelete}
        />
      </TripContextTestProvider>,
    );
    expect(screen.getByTestId("trip-target-label").textContent).toBe(OTHER.title);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Delete from Other Trip?"));
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("Travel Funds writes stay on the trip captured at mount", () => {
  it("a write hook captured when the sheet opened keeps that trip after the view changes", async () => {
    const run = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockImplementation(() => run as any);
    let write: ((args: object) => Promise<unknown>) | undefined;
    function Probe() {
      const add = useTripMutation(tripcastApi.travelFunds.travelerAddTransaction);
      write = (args) => add(args as never);
      return null;
    }
    const { rerender } = render(
      <TripContextTestProvider value={{ ...travelerViewingPrivately, viewingTripId: OTHER.tripId, viewingTrip: OTHER }}>
        <Probe />
      </TripContextTestProvider>,
    );
    rerender(
      <TripContextTestProvider value={{ ...travelerViewingPrivately, viewingTripId: CURRENT.tripId, viewingTrip: CURRENT }}>
        <Probe />
      </TripContextTestProvider>,
    );
    await write!({ token: "test-token" });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ tripId: OTHER.tripId }));
  });
});

const currentTrip: CurrentTrip = {
  tripId: CURRENT.tripId,
  title: CURRENT.title,
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};

/** A Traveler with `viewing` on screen; the shared current trip is `CURRENT`. */
const view = (viewing: typeof OTHER): Partial<TripContextValue> => ({
  role: "traveler",
  multiTripEnabled: true,
  currentTrip,
  viewingMode: viewing.tripId === CURRENT.tripId ? "follow_current" : "private",
  viewingTripId: viewing.tripId,
  viewingTrip: viewing,
});

const dinner = {
  _id: "tx1",
  title: "Dinner",
  category: "food",
  currencyCode: "USD",
  localAmount: 10,
  usdAmount: 10,
  localCurrencyPerUsd: 1,
  countsTowardMeter: true,
  visibility: "public",
  occurredAt: 0,
  createdAt: 0,
  updatedAt: 0,
};

describe("Travel Funds delete confirmations name the trip the delete goes to", () => {
  function form(target: typeof OTHER, viewValue: Partial<TripContextValue>, onDelete = vi.fn()) {
    return (
      <TripContextTestProvider value={viewValue}>
        <TransactionForm token="t" mode="edit" target={target} initial={dinner as never} onSubmit={vi.fn()} onCancel={vi.fn()} onDelete={onDelete} />
      </TripContextTestProvider>
    );
  }

  it("names the trip after Return to current, because its target is not the shared current trip", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);
    // Following the shared trip now (viewingMode "follow_current"), but the form writes to OTHER.
    render(form(OTHER, view(CURRENT)));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Delete from Other Trip?"));
  });

  it("does not name the trip when the target is the shared current trip, even in a private view of it", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);
    render(form(CURRENT, { ...view(CURRENT), viewingMode: "private" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Delete this transaction?"));
  });

  it("with no provider the confirmation is today's", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    (vi.mocked(convexReact.useQuery) as any).mockReturnValue(null);
    render(<TransactionForm token="t" mode="edit" initial={dinner as never} onSubmit={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(confirm).toHaveBeenCalledWith("Delete this transaction? This cannot be undone.");
  });
});

describe("TravelFundsSheet deletes from the trip it opened on", () => {
  beforeEach(() => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelFunds.travelerGetConfig) return config;
      if (ref === tripcastApi.travelFunds.travelerListTransactions) return [dinner];
      return null;
    });
  });

  const sheet = (viewValue: Partial<TripContextValue>) => (
    <TripContextTestProvider value={viewValue}>
      <TravelFundsSheet token="test-token" onClose={vi.fn()} />
    </TripContextTestProvider>
  );

  it("names the trip in the swipe-delete confirmation after Return to current, and deletes there", async () => {
    const run = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockImplementation(() => run as any);
    const { rerender } = render(sheet(view(OTHER)));
    rerender(sheet(view(CURRENT))); // Return to current while the sheet is open

    fireEvent.click(screen.getByRole("button", { name: "swipe delete" }));
    expect(screen.getByText("Delete from Other Trip?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx1", tripId: OTHER.tripId })));
  });

  it("keeps the plain swipe-delete title for the shared current trip and with no provider", () => {
    const { unmount } = render(sheet({ ...view(CURRENT), viewingMode: "private" }));
    fireEvent.click(screen.getByRole("button", { name: "swipe delete" }));
    expect(screen.getByText("Delete this transaction?")).toBeInTheDocument();
    unmount();

    render(<TravelFundsSheet token="test-token" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "swipe delete" }));
    expect(screen.getByText("Delete this transaction?")).toBeInTheDocument();
  });

  it("opened in private view, Return to current, then Delete in the editor: names the trip and deletes there", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const run = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockImplementation(() => run as any);
    const { rerender } = render(sheet(view(OTHER)));
    fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
    rerender(sheet(view(CURRENT)));

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Delete from Other Trip?"));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx1", tripId: OTHER.tripId })));
  });
});
