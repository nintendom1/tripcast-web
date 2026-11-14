import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getLiveSharingEnabled, setLiveSharingEnabled } from "@/lib/liveSharingPreference";
import type { CurrentTrip, TripCard, TripSwitchImpact } from "../../convex/tripcastApi";
import {
  clearLiveSharingStopNotice,
  getLiveSharingStopNotice,
  subscribeLiveSharingStopped,
} from "../../native/nativePublishingSignal";
import { LivePublishingBridge } from "../../native/LivePublishingBridge";
import { ThemeProvider } from "../../providers/ThemeProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import { PrivateTripBanner } from "./PrivateTripBanner";
import { TripChip } from "./TripChip";
import { setSwitchPending } from "./tripSwitchState";
import type { TripContextValue } from "./tripTypes";

// The chip, pane, switch dialog, banner and the REAL LivePublishingBridge together. Only Convex and the native
// plugin are mocked; the epoch moves by re-rendering the context, as the live subscription would.

const server = vi.hoisted(() => ({
  cards: [] as unknown[],
  impact: undefined as unknown,
  setCurrent: (() => Promise.resolve({})) as (args: Record<string, unknown>) => Promise<unknown>,
}));

const native = vi.hoisted(() => ({ configure: vi.fn() }));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ configurePublishing: vi.fn() }) }));
vi.mock("../../native/locationWatcher", () => ({
  configureNativeLocationPublishing: native.configure,
  isAdaptiveLocationAvailable: () => true,
  retryNativeLocationTracking: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(ref)) {
        case "trips:getSwitchImpact":
          return server.impact;
        case "travelerPreferences:travelerGetPreferences":
          return { movementDetectionEnabled: true };
        case "liveTrail:travelerGetLiveTrailStatus":
          return { enabled: true, visibleToFollowers: false };
        case "cloakingPins:travelerListCloakingPins":
          return [];
        default:
          return undefined;
      }
    },
    usePaginatedQuery: () => ({ results: server.cards, status: "Exhausted", loadMore: vi.fn() }),
    useConvex: () => ({ query: () => new Promise(() => {}) }),
    useMutation: (ref: never) => (args: Record<string, unknown>) =>
      getFunctionName(ref) === "trips:setCurrentTrip" ? server.setCurrent(args) : Promise.resolve(null),
  };
});

const AUTUMN: CurrentTrip = {
  tripId: "trip-autumn",
  title: "Autumn 2026",
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 4,
  publishingEpoch: 3,
  epochStartedAt: 1,
  multiTripEnabled: true,
};
const SUMMER: CurrentTrip = { ...AUTUMN, tripId: "trip-summer", title: "Summer 2026", revision: 5, publishingEpoch: 4 };
const WINTER: CurrentTrip = { ...AUTUMN, tripId: "trip-winter", title: "Winter 2026", revision: 5, publishingEpoch: 4 };

const card = (trip: CurrentTrip, over: Partial<TripCard> = {}): TripCard => ({
  tripId: trip.tripId,
  title: trip.title,
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

const impactTo = (trip: CurrentTrip): TripSwitchImpact => ({
  fromTrip: { tripId: AUTUMN.tripId, title: AUTUMN.title, lifecycle: "in_progress" },
  toTrip: { tripId: trip.tripId, title: trip.title, lifecycle: "in_progress" },
  expectedRevision: 4,
  isLive: false,
  openRouteVoteCount: 0,
  hasActiveActivity: false,
});

const returnToCurrent = vi.fn();

/** Context following `current` (or viewing `privately`), as the provider would hold it. */
function contextFor(current: CurrentTrip, privately?: CurrentTrip): Partial<TripContextValue> {
  const viewed = privately ?? current;
  return {
    token: "token-1",
    currentTrip: current,
    followerTrip: { tripId: current.tripId, title: current.title, lifecycle: "in_progress", isLegacy: false },
    multiTripEnabled: true,
    viewingMode: privately ? "private" : "follow_current",
    viewingTripId: viewed.tripId,
    viewingTrip: { tripId: viewed.tripId, title: viewed.title },
    returnToCurrent,
    openPrivately: vi.fn(),
  };
}

function App({ value }: { value: Partial<TripContextValue> }) {
  return (
    <ThemeProvider>
      <TripContextTestProvider value={value}>
        <LivePublishingBridge token="token-1" role="traveler" gpsSuppressedUntil={null} />
        <TripChip />
        <PrivateTripBanner />
      </TripContextTestProvider>
    </ThemeProvider>
  );
}

let bridgeNotices: string[] = [];
let unsubscribe: () => void = () => {};

/** Every trip-change notice the Traveler would see: the bridge's (shown by TripMap) and this package's. */
function allNotices(): string[] {
  const own = screen
    .queryAllByRole("status", { hidden: true })
    .map((el) => el.textContent ?? "")
    .filter((text) => text.includes("Followers now see"));
  return [...bridgeNotices, ...own];
}

function mount(value: Partial<TripContextValue>) {
  const view = render(<App value={value} />);
  return {
    user: userEvent.setup(),
    /** The context changes, as a live subscription update would. */
    update: (next: Partial<TripContextValue>) =>
      act(async () => {
        view.rerender(<App value={next} />);
      }),
  };
}

async function confirmSwitchToSummer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /·/ }));
  await screen.findByRole("dialog", { name: "Trips" });
  await user.click(screen.getByRole("button", { name: /^Summer 2026/ }));
  await user.click(screen.getByRole("button", { name: "Set as shared current" }));
  await screen.findByRole("dialog", { name: "Show Summer 2026 to Followers?" });
  await user.click(screen.getByRole("button", { name: "Show to Followers" }));
}

// The chip loads the pane lazily; warm the module so a loaded CI machine does not time the first test out.
beforeAll(async () => {
  await import("./TripSwitcherSheet");
}, 60_000);

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://example.invalid");
  localStorage.clear();
  setLiveSharingEnabled(false);
  setSwitchPending(false);
  returnToCurrent.mockReset();
  native.configure.mockReset();
  native.configure.mockResolvedValue(undefined);
  server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER), card(WINTER)];
  server.impact = impactTo(SUMMER);
  server.setCurrent = () => Promise.resolve({});
  const stale = getLiveSharingStopNotice();
  if (stale) clearLiveSharingStopNotice(stale.id);
  bridgeNotices = [];
  unsubscribe = subscribeLiveSharingStopped(() => {
    const notice = getLiveSharingStopNotice();
    if (notice) bridgeNotices.push(notice.message);
  });
});

afterEach(() => {
  unsubscribe();
  vi.unstubAllEnvs();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("one notice per trip change, with the real bridge", { timeout: 20_000 }, () => {
  it("a switch made here while live sharing was ON: the bridge's notice only, and sharing ends", async () => {
    setLiveSharingEnabled(true);
    const { user, update } = mount(contextFor(AUTUMN));
    await confirmSwitchToSummer(user);
    // The new epoch reaches the context, then the server answers.
    await update(contextFor(SUMMER));
    await waitFor(() => expect(returnToCurrent).toHaveBeenCalledTimes(1));

    expect(bridgeNotices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
    expect(allNotices()).toHaveLength(1);
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("a switch made here with live sharing OFF: this package's notice only", async () => {
    const { user, update } = mount(contextFor(AUTUMN));
    await confirmSwitchToSummer(user);
    await update(contextFor(SUMMER));
    await waitFor(() => expect(returnToCurrent).toHaveBeenCalledTimes(1));

    expect(bridgeNotices).toEqual([]);
    expect(await screen.findByText("Followers now see Summer 2026.")).toBeInTheDocument();
    expect(allNotices()).toEqual(["Followers now see Summer 2026."]);
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("the same when the answer arrives BEFORE the new epoch", async () => {
    const { user, update } = mount(contextFor(AUTUMN));
    await confirmSwitchToSummer(user);
    await waitFor(() => expect(returnToCurrent).toHaveBeenCalledTimes(1));
    expect(allNotices()).toEqual([]);
    await update(contextFor(SUMMER));
    expect(allNotices()).toEqual(["Followers now see Summer 2026."]);
  });

  it("a switch made on ANOTHER device, following current, live ON: the bridge's notice only", async () => {
    setLiveSharingEnabled(true);
    const { update } = mount(contextFor(AUTUMN));
    await update(contextFor(SUMMER));
    expect(bridgeNotices).toEqual(["Live sharing stopped: Followers now see Summer 2026."]);
    expect(allNotices()).toHaveLength(1);
    expect(getLiveSharingEnabled()).toBe(false);
  });

  it("a switch made on another device, live OFF: one notice from this package, naming the other device", async () => {
    const { update } = mount(contextFor(AUTUMN));
    await update(contextFor(SUMMER));
    expect(bridgeNotices).toEqual([]);
    expect(allNotices()).toEqual(["Followers now see Summer 2026 (changed on another device)."]);
  });

  it("a device viewing another trip privately: no trip-change notice, it stays put, the banner follows", async () => {
    const { update } = mount(contextFor(AUTUMN, WINTER));
    expect(screen.getByRole("status")).toHaveTextContent("Viewing Winter 2026 privately. Followers are viewing Autumn 2026.");
    await update(contextFor(SUMMER, WINTER));
    expect(allNotices()).toEqual([]);
    expect(returnToCurrent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Viewing privately · Winter 2026" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Viewing Winter 2026 privately. Followers are viewing Summer 2026.");
  });

  it("after a switch the banner's 'Live on' and the pane's Live tag are gone", async () => {
    setLiveSharingEnabled(true);
    const { user, update } = mount(contextFor(AUTUMN, WINTER));
    expect(screen.getByText("Live on Autumn 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    await update(contextFor(SUMMER, WINTER));
    expect(getLiveSharingEnabled()).toBe(false);
    expect(screen.queryByText(/Live on/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /·/ }));
    const pinned = (await screen.findByText(/Followers currently see:/)).parentElement as HTMLElement;
    expect(pinned).toHaveTextContent("Summer 2026");
    expect(within(pinned).queryByText("Live")).not.toBeInTheDocument();
  });
});

describe("a switch that awaits the server", { timeout: 20_000 }, () => {
  it("confirmed while offline: the pane stays usable, and the pending label clears when the answer arrives", async () => {
    let resolve: (value: unknown) => void = () => {};
    server.setCurrent = () => new Promise((r) => (resolve = r));
    const { user, update } = mount(contextFor(AUTUMN));
    await confirmSwitchToSummer(user);
    expect(screen.getByRole("button", { name: "Switching…", hidden: true })).toBeEnabled();

    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    const dialog = screen.getByRole("dialog", { name: "Show Summer 2026 to Followers?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const pane = await screen.findByRole("dialog", { name: "Trips" });
    expect(within(pane).getByText(/Still waiting: this switch may apply when you are back online/)).toBeInTheDocument();
    await user.type(within(pane).getByRole("searchbox", { name: "Search trips" }), "x");
    await user.click(within(pane).getByRole("button", { name: "Actions for Summer 2026" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeEnabled();

    // Back online: the epoch arrives and the server answers.
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await update(contextFor(SUMMER));
    await act(async () => resolve({}));
    // The Traveler walked away from the dialog, so the pane they are using stays open; the chip behind it is back.
    await waitFor(() => expect(returnToCurrent).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Current · Summer 2026", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switching…", hidden: true })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Trips" })).queryByText(/Still waiting/)).not.toBeInTheDocument();
  });
});
