import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripCard } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { menuItemsFor, TripLifecycleMenu, type TripLifecycleMenuProps } from "./TripLifecycleMenu";

const server = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  fail: null as Error | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: getFunctionName(ref), args });
      return server.fail ? Promise.reject(server.fail) : Promise.resolve(null);
    },
  };
});

const makeCard = (over: Partial<TripCard> = {}): TripCard => ({
  tripId: "summer",
  title: "Summer 2026",
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

function setup(card: TripCard, props: Partial<TripLifecycleMenuProps> = {}) {
  const user = userEvent.setup();
  render(
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
        <TripLifecycleMenu card={card} {...props} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
  return { user };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, card: TripCard) {
  await user.click(screen.getByRole("button", { name: `Actions for ${card.title}` }));
  return screen.getByRole("menu");
}

const labels = () => screen.getAllByRole("menuitem").map((el) => el.textContent);

beforeEach(() => {
  server.calls = [];
  server.fail = null;
});

describe("menuItemsFor", () => {
  it("offers each lifecycle's items (spec item 6)", () => {
    const names = (card: TripCard) => menuItemsFor(card).map((i) => i.label);
    expect(names(makeCard({ lifecycle: "planned" }))).toEqual(["Start trip", "Archive", "Edit", "Delete"]);
    expect(names(makeCard({ lifecycle: "in_progress" }))).toEqual(["Complete trip", "Edit", "Delete"]);
    expect(names(makeCard({ lifecycle: "completed" }))).toEqual(["Reopen", "Archive", "Edit", "Delete"]);
    expect(names(makeCard({ lifecycle: "archived", archivedFrom: "completed" }))).toEqual(["Restore", "Edit", "Delete"]);
  });
});

describe("TripLifecycleMenu", () => {
  it("opens with the first item focused and closes with Escape back onto the trigger", async () => {
    const card = makeCard();
    const { user } = setup(card);
    await openMenu(user, card);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Start trip" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Summer 2026" })).toHaveFocus();
  });

  it("shows only the items a lifecycle allows", async () => {
    const card = makeCard({ lifecycle: "completed" });
    const { user } = setup(card);
    await openMenu(user, card);
    expect(labels()).toEqual(["Reopen", "Archive", "Edit", "Delete"]);
  });

  it("Start trip confirms with the trip named, then sets in_progress for the card's trip", async () => {
    const card = makeCard();
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Start trip" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Start Summer 2026?");
    expect(server.calls).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Start trip" }));
    expect(server.calls).toEqual([
      { name: "trips:setLifecycle", args: { token: "tok", tripId: "summer", lifecycle: "in_progress" } },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Summer 2026" })).toHaveFocus());
  });

  it("Cancel makes no call", async () => {
    const card = makeCard();
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(server.calls).toHaveLength(0);
  });

  it("Archive sends archived; Restore returns to archivedFrom", async () => {
    const planned = makeCard();
    const first = setup(planned);
    await openMenu(first.user, planned);
    await first.user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Archive Summer 2026?");
    await first.user.click(screen.getByRole("button", { name: "Archive" }));
    expect(server.calls.at(-1)).toEqual({
      name: "trips:setLifecycle",
      args: { token: "tok", tripId: "summer", lifecycle: "archived" },
    });
  });

  it("Restore returns the trip to the lifecycle it was archived from", async () => {
    const card = makeCard({ lifecycle: "archived", archivedFrom: "completed" });
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(await screen.findByText("Summer 2026 goes back to completed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(server.calls).toEqual([
      { name: "trips:setLifecycle", args: { token: "tok", tripId: "summer", lifecycle: "completed" } },
    ]);
  });

  it("Restore with no archivedFrom sends the server's own default (completed), not a guess", async () => {
    const card = makeCard({ lifecycle: "archived" });
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(await screen.findByText("Summer 2026 goes back to where it was before it was archived.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(server.calls).toEqual([
      { name: "trips:setLifecycle", args: { token: "tok", tripId: "summer", lifecycle: "completed" } },
    ]);
  });

  it("Complete (a trip Followers do not see) calls travelerEndTrip with the card's tripId", async () => {
    const card = makeCard({ lifecycle: "in_progress" });
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Complete Summer 2026?");
    await user.click(screen.getByRole("button", { name: "Complete trip" }));
    expect(server.calls).toEqual([{ name: "endTrip:travelerEndTrip", args: { token: "tok", tripId: "summer" } }]);
  });

  it("Reopen calls travelerReopenTrip with the card's tripId", async () => {
    const card = makeCard({ lifecycle: "completed" });
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Reopen" }));
    await user.click(await screen.findByRole("button", { name: "Reopen" }));
    expect(server.calls).toEqual([{ name: "endTrip:travelerReopenTrip", args: { token: "tok", tripId: "summer" } }]);
  });

  it("the shared current trip: Complete hands over to the End Trip sheet and closes the pane", async () => {
    const card = makeCard({ lifecycle: "in_progress", isCurrent: true });
    const onRequestEndCurrentTrip = vi.fn();
    const closePane = vi.fn();
    const { user } = setup(card, { onRequestEndCurrentTrip, closePane });
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    expect(closePane).toHaveBeenCalledTimes(1);
    expect(onRequestEndCurrentTrip).toHaveBeenCalledTimes(1);
    expect(server.calls).toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the shared current trip without an End Trip sheet says where to end it", async () => {
    const card = makeCard({ lifecycle: "in_progress", isCurrent: true });
    const notify = vi.fn();
    const { user } = setup(card, { notify });
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    expect(notify).toHaveBeenCalledWith("End this trip from Options");
    expect(server.calls).toHaveLength(0);
  });

  it("the shared current trip cannot be archived: Switch Followers first", async () => {
    const card = makeCard({ lifecycle: "completed", isCurrent: true });
    const { user } = setup(card);
    await openMenu(user, card);
    const archive = screen.getByRole("menuitem", { name: /Archive/ });
    expect(archive).toBeDisabled();
    expect(archive).toHaveTextContent("Switch Followers first");
    await user.click(archive);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.calls).toHaveLength(0);
  });

  it("reports a server refusal through notify", async () => {
    server.fail = new ConvexError({ code: "trip_lifecycle_blocked", message: "A completed trip cannot become planned." });
    const card = makeCard();
    const notify = vi.fn();
    const { user } = setup(card, { notify });
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Start trip" }));
    await user.click(await screen.findByRole("button", { name: "Start trip" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("A completed trip cannot become planned."));
  });

  it("Edit opens the edit sheet for the card", async () => {
    const card = makeCard();
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Edit Summer 2026");
  });

  it("Delete opens the typed-title dialog and deletes the card's trip, not the viewed one", async () => {
    const card = makeCard();
    const { user } = setup(card);
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Delete Summer 2026?");
    await user.type(screen.getByRole("textbox"), "Summer 2026");
    await user.click(screen.getByRole("button", { name: "Delete trip" }));
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0]).toEqual({ name: "trips:deleteTrip", args: { token: "tok", tripId: "summer" } });
  });

  it("Delete is refused in the dialog for the only trip", async () => {
    const card = makeCard();
    const { user } = setup(card, { onlyTrip: true });
    await openMenu(user, card);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("You cannot delete your only trip.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete trip" })).toBeDisabled();
  });
});

describe("TripLifecycleMenu placement in the pane's scroll area", () => {
  const scrollIntoView = vi.fn();

  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  /** The pane's scroll area spans 0 to `areaHeight`; the 32px ⋯ sits at `triggerTop`; the menu is `menuHeight` tall. */
  function layout(triggerTop: number, areaHeight = 400, menuHeight = 160) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-trip-pane-scroll")) return rect(0, areaHeight);
      if (this.getAttribute("role") === "menu") return rect(0, menuHeight);
      if (this.getAttribute("aria-haspopup") === "menu") return rect(triggerTop, 32);
      return rect(0, 0);
    });
  }

  function renderInPane() {
    const card = makeCard();
    render(
      <ThemeProvider>
        <TripContextTestProvider value={{ multiTripEnabled: true, token: "tok" }}>
          <div data-trip-pane-scroll="">
            <TripLifecycleMenu card={card} />
          </div>
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    return { user: userEvent.setup(), card };
  }

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("opens upward when there is no room below the ⋯ and more above, then scrolls fully into view", async () => {
    layout(360);
    const { user, card } = renderInPane();
    const menu = await openMenu(user, card);
    expect(menu).toHaveClass("bottom-full", "mb-1");
    expect(menu).not.toHaveClass("top-full");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("opens downward when the menu fits below", async () => {
    layout(40);
    const { user, card } = renderInPane();
    const menu = await openMenu(user, card);
    expect(menu).toHaveClass("top-full", "mt-1");
    expect(menu).not.toHaveClass("bottom-full");
    expect(menu.style.maxHeight).toBe("");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("in a short scroll area (landscape) a first-row menu opens toward the larger side, capped to it, and scrolls itself", async () => {
    // 170px area, ⋯ at 10-42px, 180px menu: 2px of room above, 120px below.
    layout(10, 170, 180);
    const { user, card } = renderInPane();
    const menu = await openMenu(user, card);
    expect(menu).toHaveClass("top-full", "overflow-y-auto");
    expect(menu).not.toHaveClass("bottom-full");
    expect(menu.style.maxHeight).toBe("120px");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
  });

  it("in a short scroll area a last-row menu opens upward, capped to the room above", async () => {
    // 170px area, ⋯ at 130-162px: 122px of room above, none below.
    layout(130, 170, 180);
    const { user, card } = renderInPane();
    const menu = await openMenu(user, card);
    expect(menu).toHaveClass("bottom-full", "mb-1", "overflow-y-auto");
    expect(menu.style.maxHeight).toBe("122px");
  });

  it("measures again on every opening", async () => {
    layout(360);
    const { user, card } = renderInPane();
    expect(await openMenu(user, card)).toHaveClass("bottom-full");
    await user.click(screen.getByRole("button", { name: `Actions for ${card.title}` }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    layout(40);
    expect(await openMenu(user, card)).toHaveClass("top-full");
  });
});
