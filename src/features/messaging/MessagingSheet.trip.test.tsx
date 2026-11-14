import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../trips/tripTypes";
import { MessagingSheet } from "./MessagingSheet";

const run = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => run,
}));

vi.mock("../../components/ui/sheet", async () => {
  const React = await import("react");
  return {
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? React.createElement("div", null, children) : null,
    SheetContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    SheetTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) =>
      React.createElement("h2", props, children),
    SheetCloseButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, "Close"),
  };
});

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

function sheet(view: Partial<TripContextValue>, open: boolean) {
  return (
    <TripContextTestProvider value={view}>
      <MessagingSheet open={open} onOpenChange={vi.fn()} messages={[]} token="token" role="traveler" lastReadAt={0} onMarkRead={vi.fn()} />
    </TripContextTestProvider>
  );
}

function send(text: string) {
  const input = screen.getByPlaceholderText("Type a message...");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  run.mockReset();
  run.mockResolvedValue(null);
  HTMLElement.prototype.scrollTo = vi.fn();
});

describe("MessagingSheet pins its writes when it opens", () => {
  it("sends to the trip shown after the view changed while the sheet was closed", async () => {
    const { rerender } = render(sheet(viewOf("A"), false));
    rerender(sheet(viewOf("B"), false));
    rerender(sheet(viewOf("B"), true));

    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
    send("hello");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith({ token: "token", text: "hello", tripId: "B" });
  });

  it("never shows the old trip's title, not even for the first render of the opened sheet", () => {
    const { rerender, container } = render(sheet(viewOf("A"), false));
    rerender(sheet(viewOf("B"), false));
    const observer = new MutationObserver(() => {});
    observer.observe(container, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    rerender(sheet(viewOf("B"), true));
    const records = observer.takeRecords();
    observer.disconnect();

    // A label that first showed "Trip A" and was then updated would leave an old value behind.
    expect(records.some((record) => record.oldValue === "Trip A")).toBe(false);
    expect(container.textContent).not.toContain("Trip A");
    expect(screen.getByTestId("trip-target-label").textContent).toBe("Trip B");
  });

  it("keeps the write on the trip it opened on when the view changes while it is open", async () => {
    const { rerender } = render(sheet(viewOf("A"), true));
    rerender(sheet(viewOf("B"), true));
    send("still A");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ tripId: "A" }));
  });

  it("tells the context when the chat's trip no longer exists", async () => {
    const reportTripUnavailable = vi.fn();
    run.mockRejectedValueOnce({ data: { code: "trip_not_found", message: "gone" } });
    render(sheet({ ...viewOf("A"), reportTripUnavailable }, true));
    send("hello");
    await waitFor(() => expect(reportTripUnavailable).toHaveBeenCalledExactlyOnceWith("A"));
  });

  it("with no provider sends exactly today's arguments", async () => {
    render(
      <MessagingSheet open onOpenChange={vi.fn()} messages={[]} token="token" role="traveler" lastReadAt={0} onMarkRead={vi.fn()} />,
    );
    send("hi");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ token: "token", text: "hi" });
    expect(Object.keys(run.mock.calls[0][0])).toEqual(["token", "text"]);
  });
});
