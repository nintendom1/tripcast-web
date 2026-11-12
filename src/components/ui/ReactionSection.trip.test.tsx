import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { travelerViewingPrivately } from "../../test/renderWithTrip";
import type { TripContextValue } from "../../features/trips/tripTypes";
import { ReactionSection } from "./ReactionSection";

const run = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: () => run,
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => "div" }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const viewOf = (id: string): Partial<TripContextValue> => ({
  ...travelerViewingPrivately,
  viewingTripId: id,
  viewingTrip: { tripId: id, title: `Trip ${id}` },
});

const reactions = { entries: [{ emoji: "👍", count: 1 }] };

function section(view: Partial<TripContextValue> | undefined, targetId: string) {
  const content = <ReactionSection targetId={targetId} targetType="checkpoint" reactions={reactions} token="tok" />;
  return view ? <TripContextTestProvider value={view}>{content}</TripContextTestProvider> : content;
}

const react = () => fireEvent.click(screen.getByRole("button", { name: /👍/ }));

beforeEach(() => {
  run.mockReset().mockResolvedValue(null);
});

describe("ReactionSection pins a reaction to the trip shown with the item", () => {
  it("reacts on the trip shown when the section is reused for an item after the view changed", async () => {
    const { rerender } = render(section(viewOf("A"), "item-1"));
    rerender(section(viewOf("B"), "item-2"));
    react();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith({ token: "tok", targetId: "item-2", targetType: "checkpoint", emoji: "👍", tripId: "B" });
  });

  it("re-captures per item, not on every render", async () => {
    const { rerender } = render(section(viewOf("A"), "item-1"));
    rerender(section(viewOf("B"), "item-1"));
    react();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ targetId: "item-1", tripId: "A" }));
  });

  it("with no provider sends exactly today's arguments", async () => {
    render(section(undefined, "item-1"));
    react();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0][0]).toEqual({ token: "tok", targetId: "item-1", targetType: "checkpoint", emoji: "👍" });
  });
});
