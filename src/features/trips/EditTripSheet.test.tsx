import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripCard } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { dateInputToMs, EditTripSheet } from "./EditTripSheet";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  update: (() => Promise.resolve({ revision: 4 })) as (args: Record<string, unknown>) => Promise<unknown>,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.update(args);
    },
  };
});

const makeCard = (over: Partial<TripCard> = {}): TripCard => ({
  tripId: "summer",
  title: "Summer 2026",
  destinationSummary: "Lisbon",
  plannedStartAt: dateInputToMs("2026-06-01"),
  lifecycle: "planned",
  isLegacy: false,
  isCurrent: false,
  revision: 3,
  updatedAt: 0,
  previewStatus: "ready",
  previewVersion: 1,
  storyCount: 0,
  missionCount: 0,
  routeVoteCount: 0,
  ...over,
});

function Opener({ card, onClose }: { card: TripCard; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(true)}>
        Open edit
      </button>
      {open ? (
        <EditTripSheet
          card={card}
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

const tree = (card: TripCard, onClose: () => void) => (
  <ThemeProvider>
    <TripContextTestProvider
      value={{
        multiTripEnabled: true,
        token: "tok",
        // A DIFFERENT trip is being viewed than the card's.
        viewingTripId: "autumn",
        viewingTrip: { tripId: "autumn", title: "Autumn 2026" },
      }}
    >
      <Opener card={card} onClose={onClose} />
    </TripContextTestProvider>
  </ThemeProvider>
);

async function setup(card = makeCard()) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = render(tree(card, onClose));
  await user.click(screen.getByRole("button", { name: "Open edit" }));
  await screen.findByRole("dialog");
  return { user, onClose, rerender: (next: TripCard) => view.rerender(tree(next, onClose)) };
}

const save = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  server.calls = [];
  server.update = () => Promise.resolve({ revision: 4 });
});

describe("EditTripSheet", () => {
  it("opens prefilled with the card's values, titled with the trip, with the sheet focused (no keyboard)", async () => {
    await setup();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Edit Summer 2026");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Title" })).not.toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Summer 2026");
    expect(screen.getByRole("textbox", { name: "Destinations" })).toHaveValue("Lisbon");
    expect(screen.getByLabelText("Planned start")).toHaveValue("2026-06-01");
    expect(screen.getByLabelText("Planned end")).toHaveValue("");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("is a full-width bottom sheet below the status bar with the planned dates stacked on a phone", async () => {
    await setup();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveClass("inset-x-0", "bottom-0", "max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)]");
    expect(sheet).toHaveAttribute("data-sheet-nested-dialog");
    const start = screen.getByLabelText("Planned start");
    const end = screen.getByLabelText("Planned end");
    // One column below `sm`, two from `sm` up; neither cell nor input can push past the sheet's width.
    const grid = start.parentElement?.parentElement;
    expect(grid).toBe(end.parentElement?.parentElement);
    expect(grid).toHaveClass("grid", "grid-cols-1", "sm:grid-cols-2");
    for (const input of [start, end]) {
      expect(input.parentElement).toHaveClass("min-w-0");
      expect(input).toHaveClass("block", "w-full", "min-w-0", "max-w-full");
      expect(input).not.toHaveClass("flex");
    }
  });

  it("validates the title and the dates before calling", async () => {
    const { user } = await setup();
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "x".repeat(81));
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Title must be 80 characters or fewer.");
    expect(server.calls).toHaveLength(0);
  });

  it("saves the card's own tripId with its revision and ONLY the changed fields, then closes", async () => {
    const { user, onClose } = await setup();
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Summer 2026 (Lisbon)");
    await user.clear(screen.getByRole("textbox", { name: "Destinations" }));
    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The planned start was not touched, so it is not rewritten.
    expect(server.calls).toEqual([
      {
        name: "trips:updateTrip",
        args: {
          token: "tok",
          tripId: "summer",
          expectedRevision: 3,
          patch: { title: "Summer 2026 (Lisbon)", destinationSummary: null },
        },
      },
    ]);
  });

  it("sends a changed date, and null when a date is cleared", async () => {
    const { user } = await setup(makeCard({ plannedEndAt: dateInputToMs("2026-06-20") }));
    await user.clear(screen.getByLabelText("Planned start"));
    await user.clear(screen.getByLabelText("Planned end"));
    await user.type(screen.getByLabelText("Planned end"), "2026-06-25");
    await user.click(save());
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].args.patch).toEqual({ plannedStartAt: null, plannedEndAt: dateInputToMs("2026-06-25") });
  });

  it("makes no call for an unchanged save, and does not rewrite a date it did not touch", async () => {
    const { user, onClose } = await setup();
    await user.click(save());
    expect(onClose).toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
  });

  it("sends the revision from when it opened, not a later live card", async () => {
    const { user, rerender } = await setup();
    rerender(makeCard({ revision: 9 }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    await user.click(save());
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0].args.expectedRevision).toBe(3);
  });

  it("on a revision conflict says so, and Reload takes the card's latest values and revision", async () => {
    const { user, rerender, onClose } = await setup();
    server.update = () =>
      Promise.reject(new ConvexError({ code: "trip_revision_conflict", message: "Another device changed this trip." }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), " edited");
    await user.click(save());

    expect(await screen.findByText("Changed elsewhere. Reload?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();

    rerender(makeCard({ title: "Summer 2026 (renamed)", revision: 4 }));
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(screen.queryByText("Changed elsewhere. Reload?")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Summer 2026 (renamed)");

    server.update = () => Promise.resolve({ revision: 5 });
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    await user.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.calls.map((c) => c.args.expectedRevision)).toEqual([3, 4]);
  });

  it("shows another server refusal and stays open", async () => {
    server.update = () => Promise.reject(new ConvexError("The planned end cannot be before the planned start."));
    const { user, onClose } = await setup();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!");
    await user.click(save());
    expect(await screen.findByText("The planned end cannot be before the planned start.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape cancels and focus returns to the opener", async () => {
    const { user, onClose } = await setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open edit" })).toHaveFocus());
    expect(server.calls).toHaveLength(0);
  });
});
