import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { CurrentTrip, EffectiveTrip, TripCard } from "./convex/tripcastApi";
import { getLiveSharingEnabled, setLiveSharingEnabled } from "./lib/liveSharingPreference";
import { getStoredSession, setStoredSession } from "./lib/auth";
import { beginSwitch, getSwitchPending, resetSwitchState } from "./features/trips/tripSwitchState";
import { tokenScope } from "./native/useNativePublishingConfig";
import { createFakeConvexClient, requestShape, type FakeConvexClient } from "./test/fakeConvexClient";

// W11B: the app shell wires multi-trip. Real providers, the real TripMap (MapLibre mocked), and `convex/react` hook
// semantics over a counting fake client (`src/test/fakeConvexClient.tsx`).

vi.mock("convex/react", async () => (await import("./test/fakeConvexClient")).fakeConvexReact);
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => {
  const control = () => ({ enable: vi.fn(), disable: vi.fn() });
  class MockMap {
    dragPan = control();
    scrollZoom = control();
    boxZoom = control();
    dragRotate = control();
    keyboard = control();
    doubleClickZoom = control();
    touchZoomRotate = control();
    on = vi.fn(() => this);
    off = vi.fn(() => this);
    once = vi.fn(() => this);
    remove = vi.fn();
    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    setStyle = vi.fn(() => this);
    fitBounds = vi.fn();
    easeTo = vi.fn();
    jumpTo = vi.fn();
    getLayer = vi.fn(() => false);
    removeLayer = vi.fn();
    getSource = vi.fn(() => false);
    removeSource = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    getZoom = vi.fn(() => 12);
    project = vi.fn(() => ({ x: 0, y: 0 }));
    queryRenderedFeatures = vi.fn(() => []);
    getContainer = vi.fn(() => document.createElement("div"));
  }
  class MockMarker {
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
    remove = vi.fn();
    getElement = () => document.createElement("div");
  }
  return { default: { Map: MockMap, Marker: MockMarker, Popup: class {}, NavigationControl: class {} }, Marker: MockMarker };
});

const TOKEN = "token-a";
const AUTUMN = { tripId: "autumn", title: "Autumn 2026" };
const SUMMER = { tripId: "summer", title: "Summer 2026" };

const current = (trip: { tripId: string; title: string }, over: Partial<CurrentTrip> = {}): CurrentTrip => ({
  ...trip,
  lifecycle: "in_progress",
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 0,
  multiTripEnabled: true,
  ...over,
});
const card = (trip: { tripId: string; title: string }, over: Partial<TripCard> = {}): TripCard => ({
  ...trip,
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

type Server = {
  session: Record<string, unknown> | null | undefined;
  current: CurrentTrip | null | undefined;
  effective: EffectiveTrip | null | undefined;
  cards: TripCard[];
  failing: Record<string, Error>;
};
let server: Server;
let fake: FakeConvexClient;

function startFake() {
  fake = createFakeConvexClient((name) => {
    if (server.failing[name]) return server.failing[name];
    switch (name) {
      case "auth:currentSession":
      case "followers:followerCurrentSession":
        return server.session;
      case "trips:getCurrentTrip":
        return server.current;
      case "followers:getEffectiveTrip":
        return server.effective;
      case "trips:listTravelerTripCards":
        return { page: server.cards, isDone: true, continueCursor: "" };
      default:
        return undefined;
    }
  });
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

async function startApp(role: "traveler" | "follower", token = TOKEN) {
  server.session = { role, sessionId: `session-${token}` };
  setStoredSession({ token, role, sessionType: role === "follower" ? "follower" : "legacy", username: "fan" });
  startFake();
  const view = render(<App convexReady />);
  await settle();
  return view;
}

/** The server changed: every open subscription reads its answer again. */
async function serverChanged() {
  await act(async () => fake.update());
  await settle();
}

const watched = (name: string) => fake.active().filter((s) => s.name === name).map((s) => s.args);
const sent = (name: string) => fake.log.filter((r) => r.name === name).map((r) => r.args);
const identityKey = (token: string) => `tripcast.live-publishing.identity.${tokenScope(token)}`;
const epochKey = (token: string) => `tripcast.live-sharing.last-epoch.${tokenScope(token)}`;

async function openPrivatelyFromPane(trip: { title: string }) {
  await userEvent.click(await screen.findByRole("button", { name: /^Current · / }));
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${trip.title}`) }));
  await userEvent.click(await screen.findByRole("button", { name: "Open privately" }));
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setLiveSharingEnabled(false);
  resetSwitchState();
  server = { session: undefined, current: undefined, effective: undefined, cards: [], failing: {} };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Startup requests of today's app, captured with this same harness on `multitrip-web2` and on this branch before W11B
// (identical): kind, function and argument keys of every request, sorted. The real TripMap is included.
const TODAY_TRAVELER = [
  "mutation scoring:recordDailyVisit(localDateKey,token)",
  "watch auth:currentSession(token)",
  "watch checkpoints:listCheckpointMapPins(token)",
  "watch cloakingPins:travelerListCloakingPins(token)",
  "watch currentActivity:travelerGetCurrentActivity(token)",
  "watch endTrip:getTripFinaleStatus(token)",
  "watch followers:followerCurrentSession(token)",
  "watch journalEvents:getJournalUnreadCount(after,token)",
  "watch liveTrail:getLatestLiveTrailSample(token)",
  "watch liveTrail:travelerGetLiveTrailStatus(token)",
  "watch messages:listMessages(token)",
  "watch missions:listMissionMapPins(token)",
  "watch missions:travelerGetMissionBadgeState(token)",
  "watch mysteryMissions:listMysteryMissionMapPins(token)",
  "watch replayImages:preference(token)",
  "watch replayRoutes:manifest(token)",
  "watch routeVotes:getActiveRouteVoteAlert(token)",
  "watch routeVotes:getTravelerLocation(token)",
  "watch scoring:getScoreSummary(token)",
  "watch scoring:listUntoastedAchievements(token)",
  "watch ticker:getTickerSettings(token)",
  "watch travelerAutoState:travelerGetAutoState(token)",
  "watch travelerPreferences:travelerGetPreferences(token)",
  "watch travelerState:travelerGetState(token)",
  "watch travelFunds:travelerGetConfig(currentLocalDayStart,token)",
  "watch trips:getCurrentTrip(token)",
];
const TODAY = {
  // (a) No trip data reaches the provider: the trip query never answers.
  a: TODAY_TRAVELER,
  // (b) A Traveler whose backend says multi-trip is disabled.
  b: TODAY_TRAVELER,
  // (c) A Follower.
  c: [
    "mutation scoring:recordDailyVisit(localDateKey,token)",
    "watch auth:currentSession(token)",
    "watch checkpoints:listCheckpointMapPins(token)",
    "watch currentActivity:followerGetCurrentActivity(token)",
    "watch endTrip:getTripFinaleStatus(token)",
    "watch followers:followerCurrentSession(token)",
    "watch followers:getEffectiveTrip(token)",
    "watch journalEvents:getJournalUnreadCount(after,token)",
    "watch messages:listMessages(token)",
    "watch missions:listMissionMapPins(token)",
    "watch mysteryMissions:listMysteryMissionMapPins(token)",
    "watch replayImages:preference(token)",
    "watch replayRoutes:manifest(token)",
    "watch routeVotes:getActiveRouteVoteAlert(token)",
    "watch routeVotes:getTravelerLocation(token)",
    "watch routeVotes:listVisibleRouteVotes(token)",
    "watch scoring:getScoreSummary(token)",
    "watch scoring:listUntoastedAchievements(token)",
    "watch ticker:getTickerSettings(token)",
    "watch travelerAutoState:followerGetAutoState(token)",
    "watch travelerPreferences:followerGetPreferences(token)",
    "watch travelerState:followerGetTravelerState(token)",
    "watch travelFunds:followerGetFundsSummary(currentLocalDayStart,token)",
  ],
};

const MULTI_TRIP_COPY =
  /Current · |Viewing privately|Followers are viewing|Live on|Switching…|now sharing|hasn't started yet|no longer available|Upgrading…|Return to current/;

describe("flag gating: multi-trip off, or a Follower, starts exactly as today (item 6)", { timeout: 20_000 }, () => {
  it.each([
    ["a", "traveler", () => {}],
    ["b", "traveler", () => (server.current = current({ tripId: "legacy", title: "Legacy" }, { isLegacy: true, multiTripEnabled: false }))],
    ["c", "follower", () => (server.effective = { tripId: "legacy", title: "Legacy", lifecycle: "in_progress", isLegacy: true })],
  ] as const)("(%s) same functions, argument keys and count; no trip chip, pane, banner, notice or label", async (id, role, seed) => {
    seed();
    await startApp(role);
    expect(screen.getByRole("button", { name: "Options" })).toBeInTheDocument();
    // A full start: the map is up, not in its error fallback.
    expect(screen.queryByText("The map could not load.")).toBeNull();
    expect(fake.log.map(requestShape).sort()).toEqual([...TODAY[id]].sort());
    expect(fake.log.some((request) => "tripId" in request.args)).toBe(false);
    expect(screen.queryByText(MULTI_TRIP_COPY)).toBeNull();
    expect(screen.queryByRole("button", { name: MULTI_TRIP_COPY })).toBeNull();
  });

  it("with multi-trip on the chip renders and the shell's reads name the shared trip (the gate is real)", async () => {
    server.current = current(AUTUMN);
    await startApp("traveler");
    expect(await screen.findByRole("button", { name: "Current · Autumn 2026" })).toBeInTheDocument();
    expect(watched("endTrip:getTripFinaleStatus")).toEqual([{ token: TOKEN, tripId: "autumn" }]);
  });
});

describe("private view banner and End Trip from the trip pane (item 1)", { timeout: 20_000 }, () => {
  beforeEach(() => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
  });

  it("shows the banner only in a private view; its Stop works and Return goes back to the current trip", async () => {
    await startApp("traveler");
    expect(screen.queryByText(/privately/)).toBeNull();
    await openPrivatelyFromPane(SUMMER);
    const text = screen.getByText("Viewing Summer 2026 privately. Followers are viewing Autumn 2026.");
    const banner = text.closest("[role=status]") as HTMLElement;

    act(() => setLiveSharingEnabled(true));
    expect(within(banner).getByText("Live on Autumn 2026")).toBeInTheDocument();
    await userEvent.click(within(banner).getByRole("button", { name: "Stop" }));
    expect(getLiveSharingEnabled()).toBe(false);

    await userEvent.click(within(banner).getByRole("button", { name: "Return to current" }));
    await settle();
    expect(screen.queryByText(/privately/)).toBeNull();
    expect(screen.getByRole("button", { name: "Current · Autumn 2026" })).toBeInTheDocument();
  });

  it("Complete trip on the shared trip's card returns to it, and the End Trip sheet works on THAT trip", async () => {
    await startApp("traveler");
    await openPrivatelyFromPane(SUMMER);
    await userEvent.click(screen.getByRole("button", { name: "Viewing privately · Summer 2026" }));
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Autumn 2026" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Complete trip" }));
    await settle();

    expect(await screen.findByRole("button", { name: "Close End Trip" })).toBeInTheDocument();
    expect(screen.queryByText(/privately/)).toBeNull();
    expect(watched("endTrip:getTripCredits")).toEqual([{ token: TOKEN, tripId: "autumn" }]);
  });

  it("the chip and the banner stay usable while the map shows its error fallback", async () => {
    await startApp("traveler");
    await openPrivatelyFromPane(SUMMER);
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.failing["trips:getTripPreview"] = new Error("unused");
    for (const name of fake.active().map((s) => s.name)) {
      if (name.startsWith("checkpoints:") || name.startsWith("missions:")) server.failing[name] = new Error("map exploded");
    }
    await serverChanged();
    expect(await screen.findByText("The map could not load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Viewing privately · Summer 2026" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Return to current" }));
    expect(screen.queryByText(/privately/)).toBeNull();
  });
});

describe("while the trip subscription fails (pinned as it behaves today)", { timeout: 20_000 }, () => {
  it("a private view drops to the current trip, chip and banner hide, and Stop stays reachable in the map's Live control", async () => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
    await startApp("traveler");
    await openPrivatelyFromPane(SUMMER);
    act(() => setLiveSharingEnabled(true));
    vi.spyOn(console, "error").mockImplementation(() => {});

    server.failing["trips:getCurrentTrip"] = new Error("trip state unavailable");
    await serverChanged();
    // The context goes inert: no private view, no chip or banner, and nothing names a trip any more.
    expect(screen.queryByRole("button", { name: /^(Current|Viewing privately) · / })).toBeNull();
    expect(screen.queryByText(/privately/)).toBeNull();
    expect(fake.active().filter((s) => s.args.tripId === "summer")).toEqual([]);
    expect(watched("ticker:getTickerSettings")).toEqual([{ token: TOKEN }]);
    // The map stays up and its own Live control still stops sharing.
    expect(screen.queryByText("The map could not load.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop sharing live location", pressed: true }));
    expect(getLiveSharingEnabled()).toBe(false);

    // Back online: the retry subscribes again (the query's own hooks ran on every failing render, so the hook order
    // never changed) and the chip returns on the current trip.
    delete server.failing["trips:getCurrentTrip"];
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(screen.getByRole("button", { name: "Current · Autumn 2026" })).toBeInTheDocument();
    expect(watched("trips:getCurrentTrip")).toEqual([{ token: TOKEN }]);
  });
});

describe("leaving a session clears its publishing identity and switch state (item 2)", { timeout: 20_000 }, () => {
  beforeEach(() => {
    server.current = current(AUTUMN, { publishingEpoch: 3 });
  });

  async function signedInWithIdentity() {
    await startApp("traveler");
    await waitFor(() => expect(localStorage.getItem(identityKey(TOKEN))).toContain("autumn"));
    expect(localStorage.getItem(epochKey(TOKEN))).toBe("3");
    act(() => {
      beginSwitch("summer");
    });
  }

  function expectLeft() {
    expect(localStorage.getItem(identityKey(TOKEN))).toBeNull();
    expect(localStorage.getItem(epochKey(TOKEN))).toBeNull();
    expect(getSwitchPending()).toBe(false);
    expect(getStoredSession()).toBeNull();
  }

  it("Sign out in Options", async () => {
    await signedInWithIdentity();
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));
    await settle();
    expectLeft();
    expect(sent("auth:signOut")).toEqual([{ token: TOKEN }]);
  });

  it("a token the server no longer accepts", async () => {
    await signedInWithIdentity();
    server.session = null;
    await serverChanged();
    expectLeft();
  });

  it("Emergency Reset that logs everyone off", async () => {
    await signedInWithIdentity();
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(await screen.findByRole("button", { name: /emergency reset/i }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /log everyone off/i }));
    await userEvent.click(screen.getByRole("button", { name: "Erase ALL trips" }));
    await userEvent.type(screen.getByRole("textbox"), "ERASE ALL TRIPS");
    await userEvent.click(screen.getByRole("button", { name: "Erase ALL trips" }));
    await settle();
    expectLeft();
  });

  it("Sign out from a session check that hangs", async () => {
    await signedInWithIdentity();
    const view = screen.getByRole("button", { name: "Options" });
    expect(view).toBeInTheDocument();
    // Relaunch: the identity is still on the device, and this time the session check never answers.
    server.session = undefined;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const relaunched = render(<App convexReady />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    fireEvent.click(within(relaunched.container).getByRole("button", { name: /sign out/i }));
    vi.useRealTimers();
    await settle();
    expectLeft();
  });

  it("the next account starts on its own current trip and never hears about the previous account's switch", async () => {
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
    const first = await startApp("traveler");
    await openPrivatelyFromPane(SUMMER);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));
    await settle();
    first.unmount();

    // Account B on the same device: its own trip, at another epoch.
    server.current = current({ tripId: "winter", title: "Winter 2027" }, { publishingEpoch: 9 });
    await startApp("traveler", "token-b");
    expect(await screen.findByRole("button", { name: "Current · Winter 2027" })).toBeInTheDocument();
    expect(screen.queryByText(/changed on another device|privately|Switching…/)).toBeNull();
  });
});

describe("the top-bar ticker reads the viewed trip, the same trip as the ticker editor (item 5)", { timeout: 20_000 }, () => {
  it("follows the current trip, then the trip viewed privately", async () => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
    await startApp("traveler");
    expect(watched("ticker:getTickerSettings")).toEqual([{ token: TOKEN, tripId: "autumn" }]);
    await openPrivatelyFromPane(SUMMER);
    expect(watched("ticker:getTickerSettings")).toEqual([{ token: TOKEN, tripId: "summer" }]);
  });
});

describe("the finale names the shared trip (items 8 and 10)", { timeout: 20_000 }, () => {
  it("the finale status stays on the shared trip in a private view", async () => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
    await startApp("traveler");
    await openPrivatelyFromPane(SUMMER);
    expect(watched("endTrip:getTripFinaleStatus")).toEqual([{ token: TOKEN, tripId: "autumn" }]);
    expect(sent("endTrip:getTripFinaleStatus").some((args) => args.tripId === "summer")).toBe(false);
  });
});
