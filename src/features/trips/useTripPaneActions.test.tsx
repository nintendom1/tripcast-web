import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_SHARING_PREFERENCE_KEY } from "@/lib/liveSharingPreference";
import type { TripCard, TripSwitchImpact } from "../../convex/tripcastApi";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { TripChip, type TripChipProps } from "./TripChip";
import { getSwitchPending, setSwitchPending, STILL_WAITING_MESSAGE, SWITCH_SLOW_MS } from "./tripSwitchState";

const server = vi.hoisted(() => ({
  cards: [] as unknown[],
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  impl: {} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  impact: undefined as unknown,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    usePaginatedQuery: () => ({ results: server.cards, status: "Exhausted", loadMore: vi.fn() }),
    useQuery: (ref: never) => (getFunctionName(ref) === "trips:getSwitchImpact" ? server.impact : undefined),
    useConvex: () => ({ query: () => new Promise(() => {}) }),
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      server.calls.push({ name, args });
      return (server.impl[name] ?? (() => Promise.resolve(null)))(args);
    },
  };
});

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

const autumn = { tripId: "autumn", title: "Autumn 2026" };
const impact: TripSwitchImpact = {
  fromTrip: { ...autumn, lifecycle: "in_progress" },
  toTrip: { tripId: "summer", title: "Summer 2026", lifecycle: "in_progress" },
  expectedRevision: 5,
  isLive: false,
  openRouteVoteCount: 0,
  hasActiveActivity: false,
};

function setup(chipProps: TripChipProps = {}, userOptions: Parameters<typeof userEvent.setup>[0] = {}) {
  const returnToCurrent = vi.fn();
  render(
    <ThemeProvider>
      <TripContextTestProvider
        value={{
          multiTripEnabled: true,
          token: "tok",
          viewingTripId: autumn.tripId,
          viewingTrip: autumn,
          followerTrip: { ...autumn, lifecycle: "in_progress", isLegacy: false },
          returnToCurrent,
          openPrivately: vi.fn(),
        }}
      >
        <TripChip {...chipProps} />
      </TripContextTestProvider>
    </ThemeProvider>,
  );
  return { user: userEvent.setup(userOptions), returnToCurrent };
}

async function openPane(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /·/ }));
  await screen.findByRole("dialog", { name: "Trips" });
}

async function startSwitch(user: ReturnType<typeof userEvent.setup>) {
  await openPane(user);
  await user.click(screen.getByRole("button", { name: /^Summer 2026/ }));
  await user.click(screen.getByRole("button", { name: "Set as shared current" }));
  await screen.findByRole("dialog", { name: "Show Summer 2026 to Followers?" });
}

// The chip loads the pane lazily; warm the module so a loaded CI machine does not time the first test out.
beforeEach(async () => {
  await import("./TripSwitcherSheet");
  server.cards = [makeCard("autumn", { title: "Autumn 2026", isCurrent: true }), makeCard("summer", { title: "Summer 2026" })];
  server.calls = [];
  server.impl = {};
  server.impact = impact;
  localStorage.removeItem(LIVE_SHARING_PREFERENCE_KEY);
  setSwitchPending(false);
}, 60_000);

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("useTripPaneActions through TripChip", () => {
  it("shows Switching… while a switch awaits the server, and the chip still opens the pane", async () => {
    const { user } = setup();
    expect(screen.getByRole("button", { name: "Current · Autumn 2026" })).toBeEnabled();
    act(() => setSwitchPending(true));
    const chip = screen.getByRole("button", { name: "Switching…" });
    expect(chip).toBeEnabled();
    expect(chip).toHaveTextContent("Switching…");
    await user.click(chip);
    await screen.findByRole("dialog", { name: "Trips" });
    // The pane is fully usable; only CONFIRMING another switch is disabled (in its dialog).
    await user.click(screen.getByRole("button", { name: /^Summer 2026/ }));
    expect(screen.getByRole("button", { name: "Set as shared current" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create trip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Actions for Summer 2026" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Set as shared current" }));
    await screen.findByRole("dialog", { name: "Show Summer 2026 to Followers?" });
    expect(screen.getByText("Another switch is still waiting for the server.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show to Followers" })).toBeDisabled();
  });

  it("switch, live sharing off: nothing changes until the server answers, then ONE notice and the pane closes", async () => {
    let resolve: (value: unknown) => void = () => {};
    server.impl["trips:setCurrentTrip"] = () => new Promise((r) => (resolve = r));
    const { user, returnToCurrent } = setup();
    await startSwitch(user);
    await user.click(screen.getByRole("button", { name: "Show to Followers" }));

    expect(server.calls).toEqual([
      { name: "trips:setCurrentTrip", args: { token: "tok", tripId: "summer", expectedRevision: 5 } },
    ]);
    // The pane is modal, so the chip behind it is hidden from the accessibility tree.
    expect(screen.getByRole("button", { name: "Switching…", hidden: true })).toBeEnabled();
    expect(returnToCurrent).not.toHaveBeenCalled();
    expect(screen.queryByText("Followers now see Summer 2026.")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Trips", hidden: true })).toBeInTheDocument();

    await act(async () => resolve({}));
    expect(returnToCurrent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByText("Followers now see Summer 2026.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /·/ })).toBeEnabled();
  });

  it("switch, live sharing on: no notice from this flow (the live-sharing notice announces it)", async () => {
    localStorage.setItem(LIVE_SHARING_PREFERENCE_KEY, "true");
    const { user, returnToCurrent } = setup();
    await startSwitch(user);
    await user.click(screen.getByRole("button", { name: "Show to Followers" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(returnToCurrent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Followers now see/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a failed switch keeps the pane open and the chip usable", async () => {
    server.impl["trips:setCurrentTrip"] = () => Promise.reject(new Error("offline blip"));
    const { user, returnToCurrent } = setup();
    await startSwitch(user);
    await user.click(screen.getByRole("button", { name: "Show to Followers" }));
    expect(await screen.findByText("offline blip")).toBeInTheDocument();
    expect(returnToCurrent).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Show Summer 2026 to Followers?" })).toBeInTheDocument();
    expect(screen.queryByText(/Followers now see/)).not.toBeInTheDocument();
  });

  it("Create trip makes the new trip the highlighted card without opening or sharing it", async () => {
    const openPrivately = vi.fn();
    server.impl["trips:createTrip"] = async () => {
      server.cards = [...server.cards, makeCard("new-trip", { title: "Winter 2026", lifecycle: "planned" })];
      return { tripId: "new-trip" };
    };
    const { user, returnToCurrent } = setup();
    await openPane(user);
    await user.click(screen.getByRole("button", { name: "Create trip" }));
    const sheet = await screen.findByRole("dialog", { name: "Create trip" });
    await user.type(within(sheet).getByRole("textbox", { name: "Title" }), "Winter 2026");
    await user.click(within(sheet).getByRole("button", { name: "Create trip" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create trip" })).not.toBeInTheDocument());
    expect(await screen.findByRole("region", { name: "Preview of Winter 2026" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Trips" })).toBeInTheDocument();
    expect(server.calls.map((c) => c.name)).toEqual(["trips:createTrip"]);
    expect(openPrivately).not.toHaveBeenCalled();
    expect(returnToCurrent).not.toHaveBeenCalled();
  });

  it("each card's menu acts on its own trip while another is viewed", async () => {
    const { user } = setup();
    await openPane(user);
    await user.click(screen.getByRole("button", { name: "Actions for Summer 2026" }));
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    await user.click(await screen.findByRole("button", { name: "Complete trip" }));
    expect(server.calls).toEqual([{ name: "endTrip:travelerEndTrip", args: { token: "tok", tripId: "summer" } }]);
  });

  it("Complete on the shared current trip opens the End Trip sheet and closes the pane", async () => {
    const onRequestEndCurrentTrip = vi.fn();
    const { user } = setup({ onRequestEndCurrentTrip });
    await openPane(user);
    await user.click(screen.getByRole("button", { name: "Actions for Autumn 2026" }));
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    expect(onRequestEndCurrentTrip).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.calls).toHaveLength(0);
  });

  it("without an End Trip sheet, Complete on the current trip says to use Options", async () => {
    const { user } = setup();
    await openPane(user);
    await user.click(screen.getByRole("button", { name: "Actions for Autumn 2026" }));
    await user.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    expect(await screen.findByText("End this trip from Options")).toBeInTheDocument();
  });

  it("Delete is refused for the only trip", async () => {
    server.cards = [makeCard("autumn", { title: "Autumn 2026", isCurrent: false })];
    const { user } = setup();
    await openPane(user);
    await user.click(screen.getByRole("button", { name: "Actions for Autumn 2026" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("You cannot delete your only trip.")).toBeInTheDocument();
  });
});

describe("a switch the Traveler walked away from", () => {
  const withSpring = () => {
    server.cards = [
      makeCard("autumn", { title: "Autumn 2026", isCurrent: true }),
      makeCard("summer", { title: "Summer 2026" }),
      makeCard("spring", { title: "Spring 2026" }),
    ];
  };
  const slowCancel = async (user: ReturnType<typeof userEvent.setup>) => {
    await startSwitch(user);
    await user.click(screen.getByRole("button", { name: "Show to Followers" }));
    await act(async () => {
      vi.advanceTimersByTime(SWITCH_SLOW_MS + 1);
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Show Summer/ })).not.toBeInTheDocument());
  };

  it("cancelling a slow switch says it may still complete and keeps showing Switching…", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.impl["trips:setCurrentTrip"] = () => new Promise(() => {});
    const { user } = setup({}, { advanceTimers: vi.advanceTimersByTime });
    await slowCancel(user);
    expect(screen.getByText("This switch may still complete.")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(true);
    expect(screen.getByRole("button", { name: "Switching…", hidden: true })).toBeInTheDocument();
  });

  it("A's late answer after Cancel leaves trip C's dialog open, clears only A's pending state and tells the Traveler", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    withSpring();
    const resolvers: Array<(value: unknown) => void> = [];
    server.impl["trips:setCurrentTrip"] = () => new Promise((r) => resolvers.push(r));
    const { user, returnToCurrent } = setup({}, { advanceTimers: vi.advanceTimersByTime });
    await slowCancel(user);

    // Open C's dialog while A is still waiting: it cannot confirm.
    await user.click(screen.getByRole("button", { name: /^Spring 2026/ }));
    await user.click(screen.getByRole("button", { name: "Set as shared current" }));
    await screen.findByRole("dialog", { name: "Show Spring 2026 to Followers?" });
    expect(screen.getByRole("button", { name: "Show to Followers" })).toBeDisabled();

    await act(async () => resolvers[0]({}));

    expect(screen.getByRole("dialog", { name: "Show Spring 2026 to Followers?" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Trips", hidden: true })).toBeInTheDocument();
    expect(getSwitchPending()).toBe(false);
    expect(returnToCurrent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Followers now see Summer 2026.")).toBeInTheDocument();
    // C can now confirm (its snapshot is taken once the other switch is out of the way).
    await waitFor(() => expect(screen.getByRole("button", { name: "Show to Followers" })).toBeEnabled());
    expect(server.calls.filter((c) => c.name === "trips:setCurrentTrip")).toHaveLength(1);
  });

  it("a late failure after Cancel is reported and clears the pending state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reject: (error: unknown) => void = () => {};
    server.impl["trips:setCurrentTrip"] = () => new Promise((_, r) => (reject = r));
    const { user, returnToCurrent } = setup({}, { advanceTimers: vi.advanceTimersByTime });
    await slowCancel(user);
    await act(async () => reject(new Error("The server said no")));
    expect(screen.getByText("Summer 2026 was not shown to Followers. The server said no")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(false);
    expect(returnToCurrent).not.toHaveBeenCalled();
  });

  it("a late success with nothing else open closes the pane and announces", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resolvers: Array<(value: unknown) => void> = [];
    server.impl["trips:setCurrentTrip"] = () => new Promise((r) => resolvers.push(r));
    const { user, returnToCurrent } = setup({}, { advanceTimers: vi.advanceTimersByTime });
    await slowCancel(user);
    await act(async () => resolvers[0]({}));
    expect(returnToCurrent).toHaveBeenCalledTimes(1);
    expect(getSwitchPending()).toBe(false);
    expect(screen.getByText("Followers now see Summer 2026.")).toBeInTheDocument();
  });

  it("goes offline after confirming: says it is still waiting, and the pane stays fully usable", async () => {
    server.impl["trips:setCurrentTrip"] = () => new Promise(() => {});
    const { user } = setup();
    await startSwitch(user);
    await user.click(screen.getByRole("button", { name: "Show to Followers" }));
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    const dialog = screen.getByRole("dialog", { name: "Show Summer 2026 to Followers?" });
    expect(within(dialog).getByText(STILL_WAITING_MESSAGE)).toBeInTheDocument();
    // Cancel is available even though no answer came.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Show Summer/ })).not.toBeInTheDocument());

    // The pane still works: it says so, searches, and its create and card menus open.
    const pane = screen.getByRole("dialog", { name: "Trips" });
    expect(within(pane).getByText(STILL_WAITING_MESSAGE)).toBeInTheDocument();
    await user.type(within(pane).getByRole("searchbox", { name: "Search trips" }), "x");
    await user.click(within(pane).getByRole("button", { name: "Actions for Summer 2026" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
    expect(getSwitchPending()).toBe(true);
  });
});
