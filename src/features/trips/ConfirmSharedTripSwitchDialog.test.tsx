import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { LIVE_SHARING_PREFERENCE_KEY } from "@/lib/liveSharingPreference";
import type { TripCard, TripSwitchImpact } from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "./tripTypes";
import { ConfirmSharedTripSwitchDialog, switchImpactLines } from "./ConfirmSharedTripSwitchDialog";
import { beginSwitch, endSwitch, getSwitchPending, setSwitchPending, STILL_WAITING_MESSAGE, SWITCH_SLOW_MS } from "./tripSwitchState";

const server = vi.hoisted(() => ({
  impact: undefined as unknown,
  impactThrows: null as Error | null,
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  setCurrent: (() => Promise.resolve(null)) as (args: Record<string, unknown>) => Promise<unknown>,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName: nameOf } = await import("convex/server");
  return {
    useQuery: (ref: never) => {
      if (nameOf(ref) !== "trips:getSwitchImpact") return undefined;
      if (server.impactThrows) throw server.impactThrows;
      return server.impact;
    },
    useMutation: (ref: never) => (args: Record<string, unknown>) => {
      server.calls.push({ name: nameOf(ref), args });
      return server.setCurrent(args);
    },
  };
});

const impactOf = (over: Partial<TripSwitchImpact> = {}): TripSwitchImpact => ({
  fromTrip: { tripId: "autumn", title: "Autumn 2026", lifecycle: "in_progress" },
  toTrip: { tripId: "summer", title: "Summer 2026", lifecycle: "in_progress" },
  expectedRevision: 5,
  isLive: false,
  openRouteVoteCount: 0,
  hasActiveActivity: false,
  ...over,
});

const summer: TripCard = {
  tripId: "summer",
  title: "Summer 2026",
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
};

const conflict = () => new ConvexError({ code: "trip_revision_conflict", message: "Another device changed the shared trip." });

type Harness = {
  ctx: Partial<TripContextValue>;
  onClose: Mock<() => void>;
  onSwitched: Mock<() => void>;
  onNotice: Mock<(message: string) => void>;
};

function Opener({ harness }: { harness: Harness }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(true)}>
        Open switch
      </button>
      {open ? (
        <ConfirmSharedTripSwitchDialog
          card={summer}
          returnFocusRef={ref}
          onClose={() => {
            harness.onClose();
            setOpen(false);
          }}
          onSwitched={harness.onSwitched}
          onNotice={harness.onNotice}
        />
      ) : null}
    </>
  );
}

function setup(ctxOver: Partial<TripContextValue> = {}) {
  const harness: Harness = {
    ctx: {
      multiTripEnabled: true,
      token: "tok",
      // A DIFFERENT trip is being viewed than the card's.
      viewingTripId: "winter",
      viewingTrip: { tripId: "winter", title: "Winter 2026" },
      viewingMode: "private",
      currentTrip: {
        tripId: "autumn",
        title: "Autumn 2026",
        lifecycle: "in_progress",
        isLegacy: false,
        revision: 5,
        publishingEpoch: 1,
        epochStartedAt: 0,
        multiTripEnabled: true,
      },
      returnToCurrent: vi.fn(),
      ...ctxOver,
    },
    onClose: vi.fn(),
    onSwitched: vi.fn(),
    onNotice: vi.fn(),
  };
  const tree = (h: Harness) => (
    <TripContextTestProvider value={h.ctx}>
      <Opener harness={h} />
    </TripContextTestProvider>
  );
  const view = render(tree(harness));
  return { harness, rerender: () => view.rerender(tree(harness)) };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open switch" }));
  return screen.findByRole("dialog");
}

const confirmButton = () => screen.getByRole("button", { name: "Show to Followers" });

beforeEach(() => {
  server.impact = impactOf();
  server.impactThrows = null;
  server.calls = [];
  server.setCurrent = () => Promise.resolve(null);
  localStorage.removeItem(LIVE_SHARING_PREFERENCE_KEY);
  setSwitchPending(false);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("switchImpactLines", () => {
  it("lists only the lines that apply", () => {
    expect(switchImpactLines(impactOf())).toEqual(["Followers will stop seeing Autumn 2026 and see Summer 2026."]);
    expect(
      switchImpactLines(
        impactOf({
          isLive: true,
          openRouteVoteCount: 2,
          hasActiveActivity: true,
          lastUntaggedIngestAt: Date.now() - 1000,
          toTrip: { tripId: "summer", title: "Summer 2026", lifecycle: "completed" },
        }),
      ),
    ).toEqual([
      "Followers will stop seeing Autumn 2026 and see Summer 2026.",
      "Live location sharing stops on all your devices. Turn it on again from Summer 2026.",
      "2 open votes and your current activity stay on Autumn 2026.",
      "A device on an older TripCast app will stop sharing until it's updated.",
      "Followers see its finished Story.",
    ]);
  });

  it("drops the older-app line after seven days and words votes-only and activity-only", () => {
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    expect(switchImpactLines(impactOf({ lastUntaggedIngestAt: old, openRouteVoteCount: 1 }))).toEqual([
      "Followers will stop seeing Autumn 2026 and see Summer 2026.",
      "1 open vote stays on Autumn 2026.",
    ]);
    expect(switchImpactLines(impactOf({ hasActiveActivity: true }))[1]).toBe("Your current activity stays on Autumn 2026.");
  });
});

describe("ConfirmSharedTripSwitchDialog: pending requests", () => {
  it("cannot confirm while another switch awaits the server, then takes its snapshot once it is out of the way", async () => {
    const user = userEvent.setup();
    const other = beginSwitch("another");
    const { rerender } = setup();
    await openDialog(user);
    expect(screen.getByText("Another switch is still waiting for the server.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    // The other switch moves the revision: the snapshot must come from AFTER it.
    server.impact = impactOf({ expectedRevision: 6 });
    act(() => endSwitch(other));
    rerender();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    await user.click(confirmButton());
    expect(server.calls[0].args.expectedRevision).toBe(6);
  });

  it("offline after confirming: says it is still waiting and Cancel is available, with the flag kept", async () => {
    const user = userEvent.setup();
    server.setCurrent = () => new Promise(() => {});
    const { harness } = setup();
    await openDialog(user);
    await user.click(confirmButton());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(STILL_WAITING_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(harness.onClose).toHaveBeenCalled();
    expect(harness.onNotice).toHaveBeenCalledWith("This switch may still complete.");
    expect(getSwitchPending()).toBe(true);
  });

  it("after the bounded time with no answer it says it is still waiting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.setCurrent = () => new Promise(() => {});
    setup();
    await openDialog(user);
    await user.click(confirmButton());
    expect(screen.queryByText(STILL_WAITING_MESSAGE)).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(SWITCH_SLOW_MS + 1);
    });
    expect(screen.getByText(STILL_WAITING_MESSAGE)).toBeInTheDocument();
  });

  it("a late failure after the dialog was dismissed is reported through onNotice and clears its own request", async () => {
    const user = userEvent.setup();
    let reject: (error: unknown) => void = () => {};
    server.setCurrent = () => new Promise((_, r) => (reject = r));
    const { harness } = setup();
    await openDialog(user);
    await user.click(confirmButton());
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => reject(conflict()));
    expect(harness.onNotice).toHaveBeenLastCalledWith(
      "Summer 2026 was not shown to Followers. Another device changed the shared trip.",
    );
    expect(getSwitchPending()).toBe(false);
  });
});

describe("ConfirmSharedTripSwitchDialog", () => {
  it("names the trip, offers Cancel and Show to Followers, and returns focus on Cancel", async () => {
    const user = userEvent.setup();
    const { harness } = setup();
    const dialog = await openDialog(user);
    expect(dialog).toHaveAccessibleName("Show Summer 2026 to Followers?");
    expect(screen.getByText("Followers will stop seeing Autumn 2026 and see Summer 2026.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(harness.onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open switch" })).toHaveFocus());
    expect(server.calls).toHaveLength(0);
  });

  it("Escape cancels without a call", async () => {
    const user = userEvent.setup();
    const { harness } = setup();
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(harness.onClose).toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
  });

  it("sends the revision snapshotted at open, never a later live value, with the card's tripId", async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    await openDialog(user);
    // The live query moves on while the dialog is open and re-renders.
    server.impact = impactOf({ expectedRevision: 6 });
    rerender();
    await user.click(confirmButton());
    expect(server.calls).toEqual([
      { name: "trips:setCurrentTrip", args: { token: "tok", tripId: "summer", expectedRevision: 5 } },
    ]);
  });

  it("shows nothing as switched until the server answers, then clears the flag and switches once", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    server.setCurrent = () => new Promise((r) => (resolve = r));
    const { harness } = setup();
    await openDialog(user);
    await user.click(confirmButton());

    expect(getSwitchPending()).toBe(true);
    expect(harness.ctx.returnToCurrent).not.toHaveBeenCalled();
    expect(harness.onSwitched).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Escape does not dismiss while the request is in flight.
    await user.keyboard("{Escape}");
    expect(harness.onClose).not.toHaveBeenCalled();

    await act(async () => resolve({}));
    expect(getSwitchPending()).toBe(false);
    expect(harness.ctx.returnToCurrent).toHaveBeenCalledTimes(1);
    expect(harness.onSwitched).toHaveBeenCalledTimes(1);
  });

  it("announces nothing itself, whether live sharing was on or off (the epoch observer does)", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LIVE_SHARING_PREFERENCE_KEY, "true");
    const { harness } = setup();
    await openDialog(user);
    await user.click(confirmButton());
    await waitFor(() => expect(harness.onSwitched).toHaveBeenCalledTimes(1));
    expect(harness.onNotice).not.toHaveBeenCalled();
    expect(localStorage.getItem(LIVE_SHARING_PREFERENCE_KEY)).toBe("true");
  });

  it("handles a revision conflict: names the new shared trip, clears the flag, and re-snapshots the reloaded impact", async () => {
    const user = userEvent.setup();
    server.setCurrent = () => Promise.reject(conflict());
    const { harness, rerender } = setup({
      currentTrip: {
        tripId: "winter",
        title: "Winter 2026",
        lifecycle: "in_progress",
        isLegacy: false,
        revision: 7,
        publishingEpoch: 2,
        epochStartedAt: 0,
        multiTripEnabled: true,
      },
    });
    await openDialog(user);
    await user.click(confirmButton());

    expect(await screen.findByText("Another device changed the shared trip to Winter 2026.")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(false);
    expect(harness.ctx.returnToCurrent).not.toHaveBeenCalled();
    expect(harness.onClose).not.toHaveBeenCalled();
    // The impact has not reloaded past the refused revision yet: no new snapshot, so no confirm.
    expect(confirmButton()).toBeDisabled();

    server.impact = impactOf({ expectedRevision: 7, fromTrip: { tripId: "winter", title: "Winter 2026", lifecycle: "in_progress" } });
    rerender();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(screen.getByText("Followers will stop seeing Winter 2026 and see Summer 2026.")).toBeInTheDocument();

    server.setCurrent = () => Promise.resolve({});
    await user.click(confirmButton());
    expect(server.calls.map((c) => c.args.expectedRevision)).toEqual([5, 7]);
  });

  it("shows a trip deleted meanwhile inline, keeps the dialog open and clears the flag", async () => {
    const user = userEvent.setup();
    server.setCurrent = () => Promise.reject(new ConvexError({ code: "trip_not_found", message: "Trip not found." }));
    const { harness } = setup();
    await openDialog(user);
    await user.click(confirmButton());
    expect(await screen.findByText("This trip was deleted or is no longer available.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(false);
    expect(harness.onSwitched).not.toHaveBeenCalled();
  });

  it("shows the server's refusal for a trip archived meanwhile inline", async () => {
    const user = userEvent.setup();
    server.setCurrent = () =>
      Promise.reject(
        new ConvexError({ code: "trip_lifecycle_blocked", message: "Restore this trip before showing it to Followers." }),
      );
    setup();
    await openDialog(user);
    await user.click(confirmButton());
    expect(await screen.findByText("Restore this trip before showing it to Followers.")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables confirm and says so when the trip is archived in the live impact", async () => {
    const user = userEvent.setup();
    server.impact = impactOf({ toTrip: { tripId: "summer", title: "Summer 2026", lifecycle: "archived" } });
    setup();
    await openDialog(user);
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText("This trip is archived. Restore it first.")).toBeInTheDocument();
  });

  it("disables confirm while the impact loads", async () => {
    const user = userEvent.setup();
    server.impact = undefined;
    setup();
    await openDialog(user);
    expect(screen.getByText("Checking what will change…")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("disables confirm and says so while offline", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    setup();
    await openDialog(user);
    expect(screen.getByText("You're offline.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(server.calls).toHaveLength(0);
  });

  it("says it is waiting after a slow response, and Retry sends the SAME snapshot", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const resolvers: Array<(value: unknown) => void> = [];
    server.setCurrent = () => new Promise((r) => resolvers.push(r));
    const { harness, rerender } = setup();
    await openDialog(user);
    await user.click(confirmButton());
    expect(screen.queryByText("Waiting for server…")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(SWITCH_SLOW_MS + 1);
    });
    expect(screen.getByText("Waiting for server…")).toBeInTheDocument();
    expect(getSwitchPending()).toBe(true);

    server.impact = impactOf({ expectedRevision: 9 });
    rerender();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(server.calls.map((c) => c.args.expectedRevision)).toEqual([5, 5]);

    await act(async () => resolvers[1]({}));
    expect(harness.onSwitched).toHaveBeenCalledTimes(1);
    expect(getSwitchPending()).toBe(false);
    // The first attempt answering later does not switch twice.
    await act(async () => resolvers[0]({}));
    expect(harness.onSwitched).toHaveBeenCalledTimes(1);
    expect(harness.ctx.returnToCurrent).toHaveBeenCalledTimes(1);
  });

  it("contains a failing impact query in the dialog", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.impactThrows = new ConvexError({ code: "trip_not_found", message: "Trip not found." });
    setup();
    await openDialog(user);
    expect(await screen.findByText("This trip is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show to Followers" })).not.toBeInTheDocument();
  });
});
