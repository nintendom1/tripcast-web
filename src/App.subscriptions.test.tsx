import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { CurrentTrip, EffectiveTrip, TripCard } from "./convex/tripcastApi";
import { setLiveSharingEnabled } from "./lib/liveSharingPreference";
import { setStoredSession } from "./lib/auth";
import { resetSwitchState } from "./features/trips/tripSwitchState";
import { createFakeConvexClient, type FakeConvexClient } from "./test/fakeConvexClient";

// W11B item 7 (perf gate 5): subscriptions held by the trip pane and the map, counted by a fake client that, like the
// real one, holds one subscription per distinct function and arguments. Real providers and TripMap (MapLibre mocked).

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
      case "trips:getTripPreview":
        return null;
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
  vi.restoreAllMocks();
});

const TEN = Array.from({ length: 10 }, (_, i) => ({ tripId: `trip-${i}`, title: `Trip number ${i}` }));
const shapes = () => fake.active().map((s) => `${s.name}:${String(s.args.tripId ?? "")}`).sort();
const forTrip = (tripId: string) => fake.active().filter((s) => s.args.tripId === tripId);

describe("trip pane subscriptions", { timeout: 20_000 }, () => {
  beforeEach(() => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), ...TEN.map((trip) => card(trip))];
  });

  it("moving the highlight across 10 cards keeps the count; previews are one-shot; closing leaves no pane subscription", async () => {
    await startApp("traveler");
    const before = shapes();
    await userEvent.click(screen.getByRole("button", { name: "Current · Autumn 2026" }));
    await settle();
    const open = shapes();
    // The pane holds one list subscription (the catalog), nothing per card.
    expect(open.filter((s) => !before.includes(s))).toEqual(["trips:listTravelerTripCards:"]);

    for (const trip of TEN) {
      await userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${trip.title}`) }));
      await settle();
      expect(shapes()).toEqual(open);
    }
    const previews = fake.log.filter((request) => request.name === "trips:getTripPreview");
    expect(previews.map((request) => request.kind)).toEqual(TEN.map(() => "query"));
    expect(previews.map((request) => request.args.tripId)).toEqual(TEN.map((trip) => trip.tripId));

    await userEvent.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(shapes()).toEqual(before);
  });
});

describe("map subscriptions in a private view", { timeout: 20_000 }, () => {
  beforeEach(() => {
    server.current = current(AUTUMN);
    server.cards = [card(AUTUMN, { isCurrent: true }), card(SUMMER)];
  });

  it("a private view holds the map's subscriptions one for one, and Return leaves none for the viewed trip", async () => {
    await startApp("traveler");
    const following = shapes();
    await userEvent.click(screen.getByRole("button", { name: "Current · Autumn 2026" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Summer 2026/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Open privately" }));
    await settle();
    const viewing = shapes();
    const tagged = (list: string[], tripId: string) =>
      list.filter((s) => s.endsWith(`:${tripId}`)).map((s) => s.slice(0, -tripId.length));
    const untagged = (list: string[]) => list.filter((s) => s.endsWith(":"));
    const THEME = ["travelerAutoState:travelerGetAutoState:", "travelerPreferences:travelerGetPreferences:"];
    // On the shared trip in every view: the finale status, the publisher's two live-trail reads, and the theme's two.
    expect(tagged(viewing, "autumn")).toEqual([
      "endTrip:getTripFinaleStatus:",
      "liveTrail:getLatestLiveTrailSample:",
      "liveTrail:travelerGetLiveTrailStatus:",
      ...THEME,
    ]);
    // Everything else that names a trip (the map, its dock and features) moved one for one to Summer. Map pins are one
    // page subscription in both views here (the trip has under 200 pins); N pins hold ceil(N / 200) pages in either.
    const sharedOnly = tagged(viewing, "autumn").filter((s) => !THEME.includes(s));
    expect([...tagged(viewing, "summer"), ...sharedOnly].sort()).toEqual(tagged(following, "autumn"));
    expect(tagged(viewing, "summer").filter((s) => s.startsWith("checkpoints:listTripMapPins"))).toHaveLength(1);
    expect(untagged(viewing)).toEqual(untagged(following));
    // So the map holds the same count in both views; the whole app holds 2 more in a private view, because the theme's
    // two shared-trip reads no longer share a subscription with the map's reads of the same functions.
    expect(viewing).toHaveLength(following.length + 2);

    await userEvent.click(screen.getByRole("button", { name: "Return to current" }));
    await settle();
    expect(forTrip("summer")).toEqual([]);
    expect(shapes()).toEqual(following);
  });
});
