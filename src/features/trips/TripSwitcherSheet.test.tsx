import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { setLiveSharingEnabled } from "@/lib/liveSharingPreference";
import type { TripCard, TripPreview } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { TripsPaneToggle, type TripsPaneToggleProps } from "./TripsPaneToggle";

const server = vi.hoisted(() => ({
  cards: [] as unknown[],
  status: "Exhausted" as string,
  fail: false,
  listArgs: [] as unknown[],
  activeSubscriptions: 0,
  totalSubscriptions: 0,
  otherQueries: 0,
  oneShot: [] as Array<{ tripId: string; resolve: (v: unknown) => void }>,
  loadMore: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    if (server.fail) throw new Error("list failed");
    server.listArgs.push(args);
    useEffect(() => {
      server.activeSubscriptions += 1;
      server.totalSubscriptions += 1;
      return () => {
        server.activeSubscriptions -= 1;
      };
    }, []);
    return { results: server.cards, status: server.status, loadMore: server.loadMore };
  },
  useQuery: () => {
    server.otherQueries += 1;
    return undefined;
  },
  useConvex: () => ({
    query: (_ref: unknown, args: { tripId: string }) =>
      new Promise((resolve) => {
        server.oneShot.push({ tripId: args.tripId, resolve });
      }),
  }),
  useMutation: () => () => new Promise(() => {}),
}));

const makeCard = (id: string, over: Partial<TripCard> = {}): TripCard => ({
  tripId: id,
  title: `Trip ${id}`,
  lifecycle: "in_progress",
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

const previewOf = (tripId: string): TripPreview => ({
  tripId,
  previewStatus: "ready",
  previewVersion: 1,
  storyCount: 4,
  missionCount: 5,
  routeVoteCount: 6,
  route: {
    version: 1,
    bounds: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
    points: [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
    ],
    builtAt: 0,
    sourceSampleCount: 2,
  },
  coverImageUrl: null,
});

const autumn = { tripId: "autumn", title: "Autumn 2026" };

type PaneActionProps = Omit<TripsPaneToggleProps, "logoClassName" | "logo">;

function setup(value: Partial<TripContextValue> = {}, paneProps: PaneActionProps = {}) {
  const ctx: Partial<TripContextValue> = {
    multiTripEnabled: true,
    viewingTripId: autumn.tripId,
    viewingTrip: autumn,
    followerTrip: { ...autumn, lifecycle: "in_progress", isLegacy: false },
    openPrivately: vi.fn(),
    returnToCurrent: vi.fn(),
    ...value,
  };
  const tree = (
    <ThemeProvider>
      <TripContextTestProvider value={ctx}>
        <TripsPaneToggle logoClassName="flex" logo="TripCast" {...paneProps} />
      </TripContextTestProvider>
    </ThemeProvider>
  );
  render(tree);
  return ctx;
}

/** Opens the pane the one way the app does: the logo button. */
async function openPane() {
  const user = userEvent.setup();
  const logo = screen.getByRole("button", { name: /^TripCast: Trips/ });
  await user.click(logo);
  await screen.findByRole("dialog", { name: "Trips" });
  return { user, logo };
}

/** The backdrop of the dialog open over the pane (the popup is the element with the dialog role). */
function nestedBackdrop(): Element {
  const backdrop = [...document.querySelectorAll("[data-sheet-nested-dialog]")].find(
    (element) => element.getAttribute("role") !== "dialog",
  );
  if (!backdrop) throw new Error("no backdrop");
  return backdrop;
}

// The toggle loads the pane lazily; warm the module so a loaded CI machine does not time the first test out.
beforeAll(async () => {
  await import("./TripSwitcherSheet");
}, 60_000);

beforeEach(() => {
  server.cards = [];
  server.status = "Exhausted";
  server.fail = false;
  server.listArgs = [];
  server.activeSubscriptions = 0;
  server.totalSubscriptions = 0;
  server.otherQueries = 0;
  server.oneShot = [];
  server.loadMore.mockReset();
});

describe("TripSwitcherSheet: shell", () => {
  it("focuses no field on open (no keyboard), shows the pinned cards, and closes with Escape returning focus to the logo", async () => {
    server.cards = [makeCard("autumn", { isCurrent: true })];
    setup({ viewingTrip: { tripId: "summer", title: "Summer 2026" }, viewingTripId: "summer", viewingMode: "private" });
    const { user, logo } = await openPane();

    const pane = screen.getByRole("dialog", { name: "Trips" });
    // No search box, and focus is not on anything that would raise the on-screen keyboard.
    expect(within(pane).queryByRole("searchbox")).not.toBeInTheDocument();
    expect(within(pane).queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.activeElement?.matches("input, textarea, select, [contenteditable]")).toBe(false);
    // A bottom pane beside the map, not a modal: no backdrop, the logo stays reachable.
    expect(pane).not.toHaveAttribute("aria-modal", "true");
    expect(logo).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Followers currently see:/).parentElement).toHaveTextContent(
      "Followers currently see: Autumn 2026",
    );
    expect(screen.getByText(/You are viewing:/)).toHaveTextContent("You are viewing: Summer 2026");
    for (const name of ["Planned", "In progress", "Completed", "Archived"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logo).toHaveFocus();
  });

  it("closes with the close button and returns focus to the logo", async () => {
    setup();
    const { user, logo } = await openPane();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(logo).toHaveFocus();
  });

  it("slides up from the bottom beside the map, clear of the Dock and the home indicator", async () => {
    setup();
    await openPane();
    const pane = screen.getByRole("dialog", { name: "Trips" });
    expect(pane).toHaveClass("bottom-0", "inset-x-0", "max-h-[85dvh]", "z-[10]", "pb-[100px]");
    // The scroll area the card menu measures against. (jsdom drops the `env()` bottom padding it carries.)
    expect(pane.querySelector("[data-trip-pane-scroll]")).toContainElement(screen.getByRole("group", { name: "Filter by status" }));
  });

  it("puts Create trip in the header beside the close button", async () => {
    setup();
    await openPane();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.parentElement).toContainElement(screen.getByRole("button", { name: "Create trip" }));
  });

  it("renders Return to current only in private view, and it returns and closes", async () => {
    const ctx = setup({
      viewingMode: "private",
      viewingTripId: "summer",
      viewingTrip: { tripId: "summer", title: "Summer 2026" },
    });
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: "Return to current" }));
    expect(ctx.returnToCurrent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("has no Return to current while following the current trip", async () => {
    setup();
    await openPane();
    expect(screen.queryByRole("button", { name: "Return to current" })).not.toBeInTheDocument();
  });
});

describe("TripSwitcherSheet: subscriptions", () => {
  it("holds exactly one list subscription while open and none after closing", async () => {
    server.cards = [makeCard("a"), makeCard("b")];
    setup();
    expect(server.activeSubscriptions).toBe(0);

    const { user } = await openPane();
    expect(server.activeSubscriptions).toBe(1);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.activeSubscriptions).toBe(0);
    expect(server.otherQueries).toBe(0);
  });

  it("makes at most ten one-shot preview calls across ten cards and adds no subscription", async () => {
    server.cards = Array.from({ length: 10 }, (_, i) => makeCard(`t${i}`));
    setup();
    const { user } = await openPane();

    for (let i = 0; i < 10; i += 1) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^Trip t${i}`) }));
    }
    expect(server.oneShot.length).toBeLessThanOrEqual(10);
    expect(server.oneShot.length).toBe(10);
    // Each call carries the HIGHLIGHTED card's id, never the viewed trip's ("autumn").
    expect(server.oneShot.map((call) => call.tripId)).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`));
    expect(server.activeSubscriptions).toBe(1);
    expect(server.totalSubscriptions).toBe(1);
    expect(server.otherQueries).toBe(0);
  });

  it("memoises a preview: highlighting a card again makes no new call", async () => {
    server.cards = [makeCard("a"), makeCard("b")];
    setup();
    const { user } = await openPane();

    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    await act(async () => server.oneShot[0].resolve(previewOf("a")));
    await user.click(screen.getByRole("button", { name: /^Trip b/ }));
    await act(async () => server.oneShot[1].resolve(previewOf("b")));
    await user.click(screen.getByRole("button", { name: /^Trip a/ }));

    expect(server.oneShot).toHaveLength(2);
    expect(screen.getByTestId("trip-preview")).toBeInTheDocument();
  });

  it("shows a skeleton, then the route sketch and counts, and ignores a late response", async () => {
    server.cards = [makeCard("a"), makeCard("b")];
    setup();
    const { user } = await openPane();

    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    expect(screen.getByRole("status", { name: "Loading preview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Trip b/ }));
    await act(async () => server.oneShot[1].resolve({ ...previewOf("b"), storyCount: 9 }));
    expect(screen.getByText(/9 stories/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Route sketch" })).toBeInTheDocument();

    await act(async () => server.oneShot[0].resolve({ ...previewOf("a"), storyCount: 1 }));
    expect(screen.getByText(/9 stories/)).toBeInTheDocument();
    expect(screen.queryByText(/1 story/)).not.toBeInTheDocument();
  });

  it("shows a neutral placeholder when the trip has no preview yet", async () => {
    server.cards = [makeCard("a", { previewStatus: "none" })];
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    await act(async () => server.oneShot[0].resolve({ ...previewOf("a"), previewStatus: "none", route: null }));
    expect(screen.getByText("No route preview yet")).toBeInTheDocument();
  });

  it("the status filter (no typed search) is the one list subscription's argument", async () => {
    setup();
    const { user } = await openPane();
    expect(server.listArgs.at(-1)).toEqual({ token: "test-token" });
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(server.listArgs.at(-1)).toEqual({ token: "test-token", lifecycle: "completed" });
    expect(server.listArgs.some((args) => "search" in (args as object))).toBe(false);
    expect(server.totalSubscriptions).toBe(1);
  });

  it("a second tap on the highlighted trip collapses its detail; tapping it again reuses the preview", async () => {
    server.cards = [makeCard("a"), makeCard("b")];
    setup();
    const { user } = await openPane();
    const row = screen.getByRole("button", { name: /^Trip a/ });

    await user.click(row);
    await act(async () => server.oneShot[0].resolve(previewOf("a")));
    const detail = screen.getByRole("region", { name: "Preview of Trip a" });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveAttribute("aria-controls", detail.parentElement?.id);

    await user.click(row);
    expect(screen.queryByRole("region", { name: "Preview of Trip a" })).not.toBeInTheDocument();
    expect(row).toHaveAttribute("aria-pressed", "false");
    expect(row).not.toHaveAttribute("aria-controls");

    await user.click(row);
    expect(screen.getByRole("region", { name: "Preview of Trip a" })).toBeInTheDocument();
    expect(server.oneShot).toHaveLength(1);
  });
});

describe("TripSwitcherSheet: candidate actions", () => {
  it("Open privately calls the context with id, title and the card's Legacy flag and closes the pane", async () => {
    server.cards = [makeCard("summer", { title: "Summer 2026" })];
    const ctx = setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Summer 2026/ }));
    await user.click(screen.getByRole("button", { name: "Open privately" }));
    expect(ctx.openPrivately).toHaveBeenCalledWith({ tripId: "summer", title: "Summer 2026", isLegacy: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Open privately on the Legacy Trip's card says it is the Legacy Trip, so its keys stay today's", async () => {
    server.cards = [makeCard("legacy", { title: "My Trip", isLegacy: true })];
    const ctx = setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^My Trip/ }));
    await user.click(screen.getByRole("button", { name: "Open privately" }));
    expect(ctx.openPrivately).toHaveBeenCalledWith({ tripId: "legacy", title: "My Trip", isLegacy: true });
  });

  it("an upgrading trip shows Upgrading…: no highlight, no preview call, no actions or menu", async () => {
    server.cards = [makeCard("busy", { title: "Busy trip", upgradingAt: 123 })];
    setup({}, { onRequestSwitch: vi.fn(), renderCardMenu: () => <button type="button">Card menu</button> });
    await openPane();
    const list = screen.getByRole("list", { name: "Trips" });
    expect(within(list).getByText("Upgrading…")).toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open privately" })).not.toBeInTheDocument();
    expect(server.oneShot).toHaveLength(0);
  });

  it("hides Open privately for the trip already being viewed", async () => {
    server.cards = [makeCard("autumn", { title: "Autumn 2026", isCurrent: true })];
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Autumn 2026/ }));
    expect(screen.queryByRole("button", { name: "Open privately" })).not.toBeInTheDocument();
  });

  it("renders nothing for optional actions that are not supplied", async () => {
    server.cards = [makeCard("summer", { title: "Summer 2026" })];
    // The pane on its own (the logo always supplies the actions through `useTripPaneActions`).
    const { TripSwitcherSheet } = await import("./TripSwitcherSheet");
    render(
      <ThemeProvider>
        <TripContextTestProvider
          value={{ multiTripEnabled: true, viewingTripId: autumn.tripId, viewingTrip: autumn, openPrivately: vi.fn() }}
        >
          <TripSwitcherSheet open onOpenChange={() => {}} />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Summer 2026/ }));
    expect(screen.getByRole("button", { name: "Open privately" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set as shared current" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create trip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /menu|actions for/i })).not.toBeInTheDocument();
  });

  it("renders the supplied actions: switch, create and card menu", async () => {
    server.cards = [makeCard("summer", { title: "Summer 2026" }), makeCard("autumn", { title: "Autumn 2026", isCurrent: true })];
    const onRequestSwitch = vi.fn();
    const onRequestCreate = vi.fn();
    setup({}, { onRequestSwitch, onRequestCreate, renderCardMenu: (c) => <button type="button">Menu {c.tripId}</button> });
    const { user } = await openPane();

    await user.click(screen.getByRole("button", { name: "Create trip" }));
    expect(onRequestCreate).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Menu summer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Summer 2026/ }));
    await user.click(screen.getByRole("button", { name: "Set as shared current" }));
    expect(onRequestSwitch).toHaveBeenCalledWith(expect.objectContaining({ tripId: "summer" }));

    await user.click(screen.getByRole("button", { name: /^Autumn 2026/ }));
    const current = screen.getByRole("button", { name: "Set as shared current" });
    expect(current).toBeDisabled();
    expect(screen.getByText("Followers already see this trip")).toBeInTheDocument();
  });

  it("disables Set as shared current for an archived trip with Restore first", async () => {
    server.cards = [makeCard("old", { title: "Old trip", lifecycle: "archived", archivedFrom: "completed" })];
    setup({}, { onRequestSwitch: vi.fn() });
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Old trip/ }));
    const button = screen.getByRole("button", { name: "Set as shared current" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Restore first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open privately" })).toBeEnabled();
  });

  it("shows Deleting… for a deleting trip: no highlight, no preview call, no actions or menu", async () => {
    server.cards = [makeCard("gone", { title: "Gone trip", deletingAt: 123 })];
    setup({}, { onRequestSwitch: vi.fn(), renderCardMenu: () => <button type="button">Card menu</button> });
    await openPane();
    const list = screen.getByRole("list", { name: "Trips" });
    expect(within(list).getByText("Deleting…")).toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(server.oneShot).toHaveLength(0);
  });
});

describe("TripSwitcherSheet: keyboard", () => {
  it("moves between cards with the arrow keys", async () => {
    server.cards = [makeCard("a"), makeCard("b"), makeCard("c")];
    setup();
    const { user } = await openPane();
    screen.getByRole("button", { name: /^Trip a/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /^Trip b/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: /^Trip c/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /^Trip b/ })).toHaveFocus();
  });

  it("puts the highlighted card's actions next in tab order", async () => {
    server.cards = [makeCard("a"), makeCard("b"), makeCard("c")];
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    await user.tab();
    // The card's own ⋯ menu sits beside it; the panel's actions follow.
    expect(screen.getByRole("button", { name: "Actions for Trip a" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Open privately" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Set as shared current" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /^Trip b/ })).toHaveFocus();
  });

  it("keeps the preview panel while a filter change reloads the list", async () => {
    server.cards = [makeCard("a")];
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    await act(async () => server.oneShot[0].resolve(previewOf("a")));
    expect(screen.getByRole("region", { name: "Preview of Trip a" })).toBeInTheDocument();

    server.cards = [];
    server.status = "LoadingFirstPage";
    await user.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getByRole("status", { name: "Loading trips" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Preview of Trip a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open privately" })).toBeInTheDocument();
  });
});

describe("TripSwitcherSheet: states", () => {
  it("shows a loading state while the first page loads", async () => {
    server.status = "LoadingFirstPage";
    setup();
    await openPane();
    expect(screen.getByRole("status", { name: "Loading trips" })).toBeInTheDocument();
  });

  it("shows the empty state for a status with no trips", async () => {
    setup();
    const { user } = await openPane();
    expect(screen.getByText("No trips yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    expect(await screen.findByText("No trips with this status.")).toBeInTheDocument();
  });

  it("offers Load more while more pages exist", async () => {
    server.cards = [makeCard("a")];
    server.status = "CanLoadMore";
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(server.loadMore).toHaveBeenCalledWith(20);
  });

  it("contains a failing list query in the pane with a retry, leaving the header untouched", async () => {
    server.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup();
    const { user, logo } = await openPane();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Trips could not load.")).toBeInTheDocument();
    expect(logo).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();

    server.fail = false;
    server.cards = [makeCard("a")];
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /^Trip a/ })).toBeInTheDocument();
    expect(server.activeSubscriptions).toBe(1);
  });
});

describe("TripSwitcherSheet: change flows", () => {
  it("tags the pinned shared-trip card Live only while live sharing is on", async () => {
    setLiveSharingEnabled(true);
    setup();
    const { user } = await openPane();
    const pinned = screen.getByText(/Followers currently see:/).parentElement as HTMLElement;
    expect(within(pinned).getByText("Live")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    setLiveSharingEnabled(false);
    await user.click(screen.getByRole("button", { name: /^TripCast: Trips/ }));
    await screen.findByRole("dialog", { name: "Trips" });
    expect(within(screen.getByText(/Followers currently see:/).parentElement as HTMLElement).queryByText("Live")).toBeNull();
  });

  it("tells a card's menu it is the only trip when the unfiltered catalog is one card", async () => {
    server.cards = [makeCard("a")];
    const renderCardMenu = vi.fn(() => null);
    setup({}, { renderCardMenu });
    await openPane();
    expect(renderCardMenu).toHaveBeenCalledWith(expect.objectContaining({ tripId: "a" }), { onlyTrip: true });
  });

  it("does not claim the only trip while more pages exist", async () => {
    server.cards = [makeCard("a")];
    server.status = "CanLoadMore";
    const renderCardMenu = vi.fn(() => null);
    setup({}, { renderCardMenu });
    await openPane();
    expect(renderCardMenu).toHaveBeenCalledWith(expect.anything(), { onlyTrip: false });
  });
});

describe("TripSwitcherSheet: shared trip not yet known", () => {
  it("shows a quiet loading state, not an empty pinned card, and offers no switch", async () => {
    server.cards = [makeCard("a")];
    setup({ followerTrip: null, serverTripStatus: "loading" }, { onRequestSwitch: vi.fn() });
    const { user } = await openPane();
    expect(screen.getByText("Loading what Followers see…")).toBeInTheDocument();
    expect(screen.queryByText(/Followers currently see:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Trip a/ }));
    expect(screen.getByRole("button", { name: "Set as shared current" })).toBeDisabled();
    expect(screen.getByText("Available once the current trip has loaded")).toBeInTheDocument();
  });

  it("says it is unavailable when the shared trip failed", async () => {
    setup({ followerTrip: null, serverTripStatus: "unavailable" });
    await openPane();
    expect(screen.getByText("What Followers see is unavailable right now.")).toBeInTheDocument();
  });
});

describe("TripSwitcherSheet: dialogs over the pane", () => {
  it("Escape inside Create trip closes the form and leaves the pane open", async () => {
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    const form = await screen.findByRole("dialog", { name: "Create trip" });
    expect(form).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create trip" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Trips" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create trip" })).toHaveFocus();
  });

  it("a tap on the form's backdrop closes the form only", async () => {
    setup();
    const { user } = await openPane();
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    await screen.findByRole("dialog", { name: "Create trip" });

    const backdrop = nestedBackdrop();
    fireEvent.pointerDown(backdrop, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(backdrop, { button: 0 });
    fireEvent.pointerUp(backdrop, { pointerType: "mouse", button: 0 });
    fireEvent.mouseUp(backdrop, { button: 0 });
    fireEvent.click(backdrop, { button: 0 });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create trip" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Trips" })).toBeInTheDocument();
  });

  it("a tap or Escape inside a marked element beside the pane (the Create load-failure alert) leaves it open", async () => {
    const { TripSwitcherSheet } = await import("./TripSwitcherSheet");
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <TripSwitcherSheet open={open} onOpenChange={setOpen} />
          <div role="alert" data-sheet-nested-dialog="">
            <button type="button">Retry</button>
          </div>
        </>
      );
    }
    render(
      <ThemeProvider>
        <TripContextTestProvider value={{ multiTripEnabled: true, viewingTripId: autumn.tripId, viewingTrip: autumn }}>
          <Harness />
        </TripContextTestProvider>
      </ThemeProvider>,
    );
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "Trips" });
    const retry = screen.getByRole("button", { name: "Retry" });

    await user.click(retry);
    expect(retry).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Trips" })).toBeInTheDocument();

    // Escape from anywhere else still closes it.
    act(() => retry.blur());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Trips" })).not.toBeInTheDocument());
  });
});
