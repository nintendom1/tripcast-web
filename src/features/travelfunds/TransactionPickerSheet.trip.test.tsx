import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import TransactionPickerSheet from "./TransactionPickerSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../components/ui/sheet", async () => {
  const React = await import("react");
  const pass = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? React.createElement("div", null, children) : null),
    SheetBody: pass,
    SheetContent: pass,
    SheetGradientHeader: pass,
    SheetTitle: ({ children }: { children?: React.ReactNode }) => React.createElement("h2", null, children),
    SheetCloseButton: () => null,
  };
});

vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: () => ({ logFunds: vi.fn(), logInteraction: vi.fn(), error: vi.fn() }),
}));

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

const unlinked = {
  _id: "tx1",
  title: "Loose lunch",
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

const addSpy = vi.fn();
const updateSpy = vi.fn();

function picker(view: Partial<TripContextValue> | undefined, open: boolean) {
  const content = (
    <TransactionPickerSheet open={open} onOpenChange={vi.fn()} token="tok" target={{ type: "mission", id: "m1" }} />
  );
  return view ? <TripContextTestProvider value={view}>{content}</TripContextTestProvider> : content;
}

beforeEach(() => {
  vi.clearAllMocks();
  addSpy.mockReset().mockResolvedValue("new-tx");
  updateSpy.mockReset().mockResolvedValue(null);
  (vi.mocked(convexReact.useMutation) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerAddTransaction) return addSpy;
    if (ref === tripcastApi.travelFunds.travelerUpdateTransaction) return updateSpy;
    return vi.fn();
  });
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) =>
    ref === tripcastApi.travelFunds.travelerListUnlinkedTransactions ? [unlinked] : null,
  );
});

describe("TransactionPickerSheet pins its writes when it opens", () => {
  it("links an existing transaction on the trip shown after the view changed while it was closed", async () => {
    const { rerender } = render(picker(viewOf("A"), false));
    rerender(picker(viewOf("B"), false));
    rerender(picker(viewOf("B"), true));

    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
    fireEvent.click(screen.getByRole("button", { name: "Edit Loose lunch" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx1", linkedMissionId: "m1", tripId: "B" }));
  });

  it("adds a new transaction on the trip shown after the view changed while it was closed", async () => {
    const { rerender } = render(picker(viewOf("A"), false));
    rerender(picker(viewOf("B"), false));
    rerender(picker(viewOf("B"), true));

    fireEvent.click(screen.getByRole("button", { name: /new spend/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Coffee" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add & link" }));
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Coffee", linkedMissionId: "m1", tripId: "B" }));
  });

  it("with no provider sends no tripId and shows no label", async () => {
    render(picker(undefined, true));
    expect(screen.queryByTestId("trip-target-label")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Loose lunch" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(Object.keys(updateSpy.mock.calls[0][0])).not.toContain("tripId");
  });
});
