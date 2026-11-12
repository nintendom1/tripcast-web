import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { useTripMutation } from "../../convex/useTrip";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import TravelFundsSheet from "./TravelFundsSheet";
import TransactionForm from "./TransactionForm";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
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
  it("reads the funds config and transactions of the viewed trip", () => {
    render(
      <TripContextTestProvider value={travelerViewingPrivately}>
        <TravelFundsSheet token="test-token" onClose={vi.fn()} />
      </TripContextTestProvider>,
    );
    expect(convexReact.useQuery).toHaveBeenCalledWith(
      tripcastApi.travelFunds.travelerGetConfig,
      expect.objectContaining({ tripId: OTHER.tripId }),
    );
    expect(convexReact.useQuery).toHaveBeenCalledWith(
      tripcastApi.travelFunds.travelerListTransactions,
      expect.objectContaining({ tripId: OTHER.tripId }),
    );
  });

  it("sends no tripId when multi-trip is disabled", () => {
    render(<TravelFundsSheet token="test-token" onClose={vi.fn()} />);
    expect(convexReact.useQuery).toHaveBeenCalledWith(
      tripcastApi.travelFunds.travelerListTransactions,
      { token: "test-token" },
    );
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
