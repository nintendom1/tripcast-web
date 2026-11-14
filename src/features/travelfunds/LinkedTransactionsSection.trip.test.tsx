import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import LinkedTransactionsSection from "./LinkedTransactionsSection";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../providers/MusicProvider", () => ({ useMusicSafe: () => ({ sfx: vi.fn() }) }));
vi.mock("../../debug/useDebugLogger", () => ({
  useDebugLogger: () => ({ logFunds: vi.fn(), logInteraction: vi.fn(), error: vi.fn() }),
}));

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

const linked = {
  _id: "tx1",
  title: "Museum ticket",
  category: "food",
  currencyCode: "USD",
  localAmount: 10,
  usdAmount: 10,
  localCurrencyPerUsd: 1,
  countsTowardMeter: true,
  visibility: "public",
  occurredAt: 1000,
  createdAt: 0,
  updatedAt: 0,
  linkedMissionId: "m1",
};

const updateSpy = vi.fn();
const deleteSpy = vi.fn();

const section = (view: Partial<TripContextValue> | undefined) => {
  const content = <LinkedTransactionsSection mode="linked" token="tok" target={{ type: "mission", id: "m1" }} />;
  return view ? <TripContextTestProvider value={view}>{content}</TripContextTestProvider> : content;
};

beforeEach(() => {
  vi.clearAllMocks();
  updateSpy.mockReset().mockResolvedValue(null);
  deleteSpy.mockReset().mockResolvedValue(null);
  (vi.mocked(convexReact.useMutation) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerUpdateTransaction) return updateSpy;
    if (ref === tripcastApi.travelFunds.travelerDeleteTransaction) return deleteSpy;
    return vi.fn();
  });
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
    if (ref === tripcastApi.travelFunds.travelerGetConfig) return { enabled: true };
    if (ref === tripcastApi.travelFunds.travelerListTransactionsForTarget) return [linked];
    return null;
  });
});

describe("LinkedTransactionsSection pins the row editor's writes when it opens", () => {
  it("saves an edit on the trip shown after the view changed while the section was mounted", async () => {
    const { rerender } = render(section(viewOf("A")));
    rerender(section(viewOf("B")));
    fireEvent.click(screen.getByRole("button", { name: "Edit Museum ticket" }));

    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx1", tripId: "B" }));
  });

  it("deletes on the trip shown after the view changed while the section was mounted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { rerender } = render(section(viewOf("A")));
    rerender(section(viewOf("B")));
    fireEvent.click(screen.getByRole("button", { name: "Edit Museum ticket" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith({ token: "tok", transactionId: "tx1", tripId: "B" });
  });

  it("pins again when another row's editor opens after a view change", async () => {
    const second = { ...linked, _id: "tx2", title: "Boat ride" };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown) => {
      if (ref === tripcastApi.travelFunds.travelerGetConfig) return { enabled: true };
      if (ref === tripcastApi.travelFunds.travelerListTransactionsForTarget) return [linked, second];
      return null;
    });
    const { rerender } = render(section(viewOf("A")));
    fireEvent.click(screen.getByRole("button", { name: "Edit Museum ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    rerender(section(viewOf("B")));
    fireEvent.click(screen.getByRole("button", { name: "Edit Boat ride" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "tx2", tripId: "B" }));
  });

  it("with no provider sends no tripId", async () => {
    render(section(undefined));
    fireEvent.click(screen.getByRole("button", { name: "Edit Museum ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(Object.keys(updateSpy.mock.calls[0][0])).not.toContain("tripId");
  });
});
