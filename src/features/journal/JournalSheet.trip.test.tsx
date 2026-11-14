import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import JournalSheet from "./JournalSheet";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { div: "div", img: "img" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

const props = {
  events: [],
  token: "test-token",
  role: "traveler" as const,
  onClose: vi.fn(),
  onStorySelect: vi.fn(),
  onLocationFocus: vi.fn(),
  onMarkAllRead: vi.fn(),
};

function sheet(view: Partial<TripContextValue> | undefined, open = true) {
  const content = <JournalSheet {...props} open={open} />;
  return view ? <TripContextTestProvider value={view}>{content}</TripContextTestProvider> : content;
}

let mutationFn: ReturnType<typeof vi.fn>;

const openCreate = () => fireEvent.click(screen.getByRole("button", { name: "New" }));
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Add to Journal" }));

beforeEach(() => {
  vi.clearAllMocks();
  mutationFn = vi.fn().mockResolvedValue("new-cp-id");
  vi.mocked(convexReact.useMutation).mockReturnValue(mutationFn as never);
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as never);
});

describe("JournalSheet pins the new Story to the trip shown when the form opens", () => {
  it("creates on the trip shown after the view changed while the sheet was mounted", async () => {
    const { rerender } = render(sheet(viewOf("A")));
    rerender(sheet(viewOf("B")));
    openCreate();

    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
    submit();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    expect(mutationFn).toHaveBeenCalledWith(expect.objectContaining({ source: "inline_form", tripId: "B" }));
  });

  it("creates on the trip shown when the sheet is closed and reopened after the view changed", async () => {
    const { rerender } = render(sheet(viewOf("A"), false));
    rerender(sheet(viewOf("B"), false));
    rerender(sheet(viewOf("B"), true));
    openCreate();
    submit();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    expect(mutationFn).toHaveBeenCalledWith(expect.objectContaining({ tripId: "B" }));
  });

  it("keeps the trip the form opened on when the view changes while it is open", async () => {
    const { rerender } = render(sheet(viewOf("A")));
    openCreate();
    rerender(sheet(viewOf("B")));
    submit();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    expect(mutationFn).toHaveBeenCalledWith(expect.objectContaining({ tripId: "A" }));
  });

  it("with no provider sends no tripId and shows no label", async () => {
    render(sheet(undefined));
    openCreate();
    expect(screen.queryByTestId("trip-target-label")).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    expect(Object.keys(mutationFn.mock.calls[0][0])).not.toContain("tripId");
  });
});
