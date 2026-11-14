import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripCard } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { DeleteTripDialog, deleteBlockedReason } from "./DeleteTripDialog";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deleteImpl: (() => Promise.resolve(null)) as (args: Record<string, unknown>) => Promise<unknown>,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.deleteImpl(args);
    },
  };
});

const card = (over: Partial<TripCard> = {}): TripCard => ({
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

function Opener({ target, onlyTrip, onClose }: { target: TripCard; onlyTrip?: boolean; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(true)}>
        Open delete
      </button>
      {open ? (
        <DeleteTripDialog
          card={target}
          onlyTrip={onlyTrip}
          returnFocusRef={ref}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

async function setup(target: TripCard, onlyTrip = false) {
  const onClose = vi.fn();
  const user = userEvent.setup();
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
      <Opener target={target} onlyTrip={onlyTrip} onClose={onClose} />
    </TripContextTestProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open delete" }));
  await screen.findByRole("dialog");
  return { user, onClose };
}

const deleteButton = () => screen.getByRole("button", { name: "Delete trip" });

beforeEach(() => {
  server.calls = [];
  server.deleteImpl = () => Promise.resolve(null);
});
afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("DeleteTripDialog", () => {
  it("needs the exact title typed, and focuses the field", async () => {
    const { user } = await setup(card());
    const input = screen.getByRole("textbox", { name: /Type the trip title to confirm/ });
    await waitFor(() => expect(input).toHaveFocus());
    expect(deleteButton()).toBeDisabled();
    await user.type(input, "summer 2026");
    expect(deleteButton()).toBeDisabled();
    await user.clear(input);
    await user.type(input, "Summer 2026 ");
    expect(deleteButton()).toBeDisabled();
    await user.clear(input);
    await user.type(input, "Summer 2026");
    expect(deleteButton()).toBeEnabled();
  });

  it("deletes the CARD's trip, not the viewed one, then closes", async () => {
    const { user, onClose } = await setup(card());
    await user.type(screen.getByRole("textbox"), "Summer 2026");
    await user.click(deleteButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.calls).toEqual([{ name: "trips:deleteTrip", args: { token: "tok", tripId: "summer" } }]);
  });

  it.each([
    ["the shared current trip", card({ isCurrent: true }), false, "Followers are viewing this trip. Show another trip to Followers first."],
    ["the first (Legacy) trip", card({ isLegacy: true }), false, "Your first trip cannot be deleted yet."],
    ["the only trip", card(), true, "You cannot delete your only trip."],
  ])("is unavailable for %s, with the reason", async (_label, target, onlyTrip, reason) => {
    await setup(target, onlyTrip);
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
    expect(server.calls).toHaveLength(0);
  });

  it("explains each refusal reason", () => {
    expect(deleteBlockedReason(card(), false)).toBeNull();
    expect(deleteBlockedReason(card({ isCurrent: true, isLegacy: true }), true)).toMatch(/Followers are viewing/);
  });

  it("shows the server's refusal and stays open", async () => {
    server.deleteImpl = () =>
      Promise.reject(new ConvexError({ code: "trip_delete_blocked", message: "You cannot delete your only trip." }));
    const { user, onClose } = await setup(card());
    await user.type(screen.getByRole("textbox"), "Summer 2026");
    await user.click(deleteButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("You cannot delete your only trip.");
    expect(onClose).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();
  });

  it("cancels with Escape and returns focus to the opener", async () => {
    const { user, onClose } = await setup(card());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open delete" })).toHaveFocus());
    expect(server.calls).toHaveLength(0);
  });

  it("cannot delete while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const { user } = await setup(card());
    await user.type(screen.getByRole("textbox"), "Summer 2026");
    expect(screen.getByText("You're offline.")).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
  });
});

describe("DeleteTripDialog: the card changes while open", () => {
  const view = (target: TripCard) => (
    <TripContextTestProvider value={{ multiTripEnabled: true, token: "tok", viewingTripId: "autumn" }}>
      <DeleteTripDialog card={target} onClose={() => {}} />
    </TripContextTestProvider>
  );

  it("a title changed elsewhere re-targets the check: the old title no longer confirms", async () => {
    const user = userEvent.setup();
    const { rerender } = render(view(card()));
    await user.type(await screen.findByRole("textbox"), "Summer 2026");
    expect(deleteButton()).toBeEnabled();

    rerender(view(card({ title: "Summer 2026 (renamed)" })));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Delete Summer 2026 (renamed)?");
    expect(deleteButton()).toBeDisabled();
    await user.type(screen.getByRole("textbox"), " (renamed)");
    expect(deleteButton()).toBeEnabled();
    await user.click(deleteButton());
    await waitFor(() => expect(server.calls).toHaveLength(1));
  });

  it("a trip that becomes the shared current trip while open can no longer be deleted", async () => {
    const user = userEvent.setup();
    const { rerender } = render(view(card()));
    await user.type(await screen.findByRole("textbox"), "Summer 2026");
    expect(deleteButton()).toBeEnabled();

    rerender(view(card({ isCurrent: true })));
    expect(screen.getByText("Followers are viewing this trip. Show another trip to Followers first.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
    expect(server.calls).toHaveLength(0);
  });
});
