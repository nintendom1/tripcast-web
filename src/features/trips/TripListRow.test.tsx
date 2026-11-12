import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripCard } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TripListRow } from "./TripListRow";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  impl: (() => Promise.resolve(null)) as () => Promise<unknown>,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.impl();
    },
  };
});

const card = (over: Partial<TripCard> & { deleteFailed?: true } = {}): TripCard => ({
  tripId: "summer",
  title: "Summer 2026",
  lifecycle: "planned",
  isLegacy: false,
  isCurrent: false,
  revision: 1,
  updatedAt: 0,
  previewStatus: "ready",
  previewVersion: 1,
  storyCount: 0,
  missionCount: 0,
  routeVoteCount: 0,
  ...over,
});

function row(target: TripCard, onHighlight = vi.fn()) {
  render(
    <TripContextTestProvider
      value={{
        multiTripEnabled: true,
        token: "tok",
        // A DIFFERENT trip is being viewed than the card's.
        viewingTripId: "autumn",
        viewingTrip: { tripId: "autumn", title: "Autumn 2026" },
      }}
    >
      <ul>
        <TripListRow card={target} highlighted={false} viewing={false} onHighlight={onHighlight} menu={<button type="button">Menu</button>} />
      </ul>
    </TripContextTestProvider>,
  );
  return onHighlight;
}

beforeEach(() => {
  server.calls = [];
  server.impl = () => Promise.resolve(null);
});

describe("TripListRow while a trip is deleting", () => {
  it("shows Deleting… and cannot be opened, switched to or edited", async () => {
    const onHighlight = row(card({ deletingAt: 1 }));
    expect(screen.getByText("Deleting…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Delete did not finish")).toBeNull();
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it("a normal card highlights on tap, shows its menu and offers no Retry", async () => {
    const onHighlight = row(card());
    await userEvent.click(screen.getByRole("button", { name: /Summer 2026/ }));
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("a failed delete says so, stays inert, and Retry calls deleteTrip for THAT trip with the dialog's arguments", async () => {
    const onHighlight = row(card({ deletingAt: 1, deleteFailed: true }));
    expect(screen.getByText("Delete did not finish")).toBeInTheDocument();
    expect(screen.queryByText("Deleting…")).toBeNull();
    // Inert: only the Retry button exists (no card button, no menu).
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Retry"]);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0]).toEqual({ name: "trips:deleteTrip", args: { token: "tok", tripId: "summer" } });
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when the retry fails", async () => {
    server.impl = () => Promise.reject(new ConvexError({ code: "trip_not_found", message: "That trip is already gone." }));
    row(card({ deletingAt: 1, deleteFailed: true }));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That trip is already gone.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("ignores deleteFailed on a card that is not deleting", () => {
    row(card({ deleteFailed: true }));
    expect(screen.queryByText("Delete did not finish")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
