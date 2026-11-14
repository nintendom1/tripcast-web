import { act, render, screen, within } from "@testing-library/react";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { CheckpointMapPin, CurrentTrip, EffectiveTrip, TripCard } from "./convex/tripcastApi";
import { setLiveSharingEnabled } from "./lib/liveSharingPreference";
import { setStoredSession } from "./lib/auth";
import { getLiveTrailCache, resetLiveTrailCachesForTests } from "./features/map/liveTrailCache";
import { useTripPath } from "./features/map/useTripPath";
import { resetSwitchState } from "./features/trips/tripSwitchState";
import { tripcastApi } from "./convex/tripcastApi";
import { TripContextProvider, useTripContext } from "./providers/TripContextProvider";
import { createFakeConvexClient, type FakeConvexClient } from "./test/fakeConvexClient";

// W11B items 4 and 8 (UX 7 and 8): what a Follower and a second Traveler device see when the shared trip changes.
// Real providers and the real TripMap; MapLibre is mocked and the map's layer hook records what it is asked to draw.

vi.mock("convex/react", async () => (await import("./test/fakeConvexClient")).fakeConvexReact);
vi.mock("./features/map/useTripPath", () => ({ useTripPath: vi.fn() }));
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

const TOKEN = "follower-token";
const AUTUMN = { tripId: "autumn", title: "Autumn 2026" };
const SUMMER = { tripId: "summer", title: "Summer 2026" };
const pin = (id: string, lat: number, lon: number): CheckpointMapPin => ({ _id: id, lat, lon, createdAt: 1 });
const PINS: Record<string, CheckpointMapPin[]> = {
  autumn: [pin("pin-autumn", 47.6, -122.3)],
  summer: [pin("pin-summer", 40.7, -74.0)],
};
const LATEST: Record<string, { _id: string; lat: number; lon: number; sampledAt: number }> = {
  autumn: { _id: "autumn-latest", lat: 47.61, lon: -122.31, sampledAt: 700 },
  summer: { _id: "summer-latest", lat: 40.71, lon: -74.01, sampledAt: 800 },
};
/** Summer's Follower content cutoff falls after Autumn's trail: run over Autumn's cache it would drop its points. */
let CUTOFF: Record<string, number | undefined> = {};
const effective = (trip: { tripId: string; title: string }, lifecycle: EffectiveTrip["lifecycle"] = "in_progress"): EffectiveTrip => ({
  ...trip,
  lifecycle,
  isLegacy: false,
});

type Server = {
  role: "traveler" | "follower";
  effective: EffectiveTrip | null;
  current: CurrentTrip | null;
  cards: TripCard[];
  finaleEnded: boolean;
};
let server: Server;
let fake: FakeConvexClient;

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}

async function startApp(role: Server["role"], token = TOKEN) {
  server.role = role;
  setStoredSession({ token, role, sessionType: role === "follower" ? "follower" : "legacy", username: "fan" });
  fake = createFakeConvexClient((name) => {
    // The server answers for the trip it shares now; a Follower never names one.
    const shared = server.role === "follower" ? server.effective?.tripId : server.current?.tripId;
    switch (name) {
      case "auth:currentSession":
      case "followers:followerCurrentSession":
        return { role: server.role, sessionId: "s1" };
      case "followers:getEffectiveTrip":
        return server.effective;
      case "trips:getCurrentTrip":
        return server.current;
      case "trips:listTravelerTripCards":
        return { page: server.cards, isDone: true, continueCursor: "" };
      case "checkpoints:listCheckpointMapPins":
        return shared ? PINS[shared] : [];
      case "travelerPreferences:followerGetPreferences":
        return {
          visible: true,
          allowFollowersTripPath: true,
          liveTrailVisibleToFollowers: true,
          ...(shared && CUTOFF[shared] !== undefined ? { followerContentCutoffAt: CUTOFF[shared] } : {}),
        };
      case "liveTrail:getLatestLiveTrailSample":
        // A stable answer per shared trip: its arguments never change across a switch, only its result.
        return shared ? LATEST[shared] : null;
      case "endTrip:getTripFinaleStatus":
        return { ended: server.finaleEnded };
      default:
        return undefined;
    }
  });
  render(<App convexReady />);
  await settle();
}

/** The server changed: every open subscription reads its answer again. */
async function serverChanged() {
  await act(async () => fake.update());
  await settle();
}

const cacheIds = (tripId: string) => getLiveTrailCache(TOKEN, "follower", tripId).snapshot().samples.map((s) => s._id);
const drawnPins = () => (vi.mocked(useTripPath).mock.calls.at(-1)?.[1] ?? []).map((p) => p._id);
// The trail layer is fed cache rows, which carry their `_id` beyond the `LiveTrailPoint` type.
const drawnTrail = () => (vi.mocked(useTripPath).mock.calls.at(-1)?.[6] ?? []).map((s) => (s as unknown as { _id: string })._id);

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(useTripPath).mockClear();
  await resetLiveTrailCachesForTests();
  setLiveSharingEnabled(false);
  resetSwitchState();
  CUTOFF = {};
  server = { role: "follower", effective: effective(AUTUMN), current: null, cards: [], finaleEnded: false };
});

describe("a Follower when the Traveler shares another trip (UX 7)", { timeout: 20_000 }, () => {
  it("the map moves to the new trip: no old pins or trail are drawn, each trip keeps its own cache, nothing names a trip", async () => {
    getLiveTrailCache(TOKEN, "follower", "autumn").replaceReplay([{ _id: "autumn-trail", lat: 47.6, lon: -122.3, sampledAt: 500 }]);
    getLiveTrailCache(TOKEN, "follower", "summer").replaceReplay([{ _id: "summer-trail", lat: 40.7, lon: -74.0, sampledAt: 600 }]);
    await startApp("follower");
    expect(drawnPins()).toEqual(["pin-autumn"]);
    expect(drawnTrail()).toEqual(["autumn-trail", "autumn-latest"]);

    server.effective = effective(SUMMER);
    await serverChanged();

    expect(await screen.findByText("The Traveler is now sharing Summer 2026.")).toBeInTheDocument();
    expect(drawnPins()).toEqual(["pin-summer"]);
    expect(drawnTrail()).toEqual(["summer-trail", "summer-latest"]);
    expect(getLiveTrailCache(TOKEN, "follower", "summer").snapshot().samples.map((s) => s._id)).not.toContain("autumn-trail");
    expect(getLiveTrailCache(TOKEN, "follower", "autumn").snapshot().replay.map((s) => s._id)).toEqual(["autumn-trail"]);
    // The live sample answers in the same render as the switch: it joins the NEW trip's cache, never the old one's.
    expect(cacheIds("autumn")).toEqual(["autumn-trail", "autumn-latest"]);
    expect(cacheIds("summer")).toEqual(["summer-trail", "summer-latest"]);
    // Before and after the switch the Follower never sends a trip id: the server answers for the trip it shares.
    expect(fake.log.filter((request) => "tripId" in request.args)).toEqual([]);
  });

  it("A to B to A: no B sample and no B cutoff in A's cache, and A's trail draws no B segment", async () => {
    getLiveTrailCache(TOKEN, "follower", "autumn").replaceReplay([{ _id: "autumn-trail", lat: 47.6, lon: -122.3, sampledAt: 500 }]);
    CUTOFF = { summer: 650 };
    await startApp("follower");
    server.effective = effective(SUMMER);
    await serverChanged();
    expect(await screen.findByText("The Traveler is now sharing Summer 2026.")).toBeInTheDocument();
    server.effective = effective(AUTUMN);
    await serverChanged();

    expect(cacheIds("autumn")).toEqual(["autumn-trail", "autumn-latest"]);
    expect(cacheIds("summer")).toEqual(["summer-latest"]);
    expect(drawnPins()).toEqual(["pin-autumn"]);
    expect(drawnTrail()).toEqual(["autumn-trail", "autumn-latest"]);
  });

  it("open sheets and the credits replay close", async () => {
    server.finaleEnded = true;
    await startApp("follower");
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByRole("button", { name: "Close options" })).toBeInTheDocument();

    server.effective = effective(SUMMER);
    server.finaleEnded = false;
    await serverChanged();
    expect(screen.queryByRole("button", { name: "Close options" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close to map archive" })).toBeNull();
    expect(await screen.findByText("The Traveler is now sharing Summer 2026.")).toBeInTheDocument();
  });

  it("a planned trip says it has not started yet; nothing is announced at launch", async () => {
    await startApp("follower");
    expect(screen.queryByText(/now sharing|hasn't started/)).toBeNull();
    server.effective = effective(SUMMER, "planned");
    await serverChanged();
    expect(screen.getByText("Summer 2026 hasn't started yet.")).toBeInTheDocument();
    expect(screen.getByText("The Traveler is now sharing Summer 2026.")).toBeInTheDocument();
  });
});

describe("a second Traveler device when the shared trip changes elsewhere (UX 8)", { timeout: 20_000 }, () => {
  const current = (trip: { tripId: string; title: string }, publishingEpoch: number): CurrentTrip => ({
    ...trip,
    lifecycle: "in_progress",
    isLegacy: false,
    revision: publishingEpoch,
    publishingEpoch,
    epochStartedAt: 0,
    multiTripEnabled: true,
  });
  const card = (trip: { tripId: string; title: string }, isCurrent: boolean): TripCard => ({
    ...trip,
    lifecycle: "in_progress",
    isLegacy: false,
    isCurrent,
    revision: 1,
    updatedAt: 0,
    previewStatus: "ready",
    previewVersion: 1,
    storyCount: 0,
    missionCount: 0,
    routeVoteCount: 0,
  });
  const WINTER = { tripId: "winter", title: "Winter 2027" };

  beforeEach(() => {
    server.current = current(AUTUMN, 1);
    server.cards = [card(AUTUMN, true), card(SUMMER, false), card(WINTER, false)];
  });

  it("a device following current rebinds and says the change came from another device", async () => {
    await startApp("traveler", "traveler-token");
    // The Trips pane names the trip this device follows (the logo no longer does).
    await userEvent.click(screen.getByRole("button", { name: "TripCast: Trips" }));
    expect(await screen.findByText(/You are viewing:/)).toHaveTextContent("You are viewing: Autumn 2026");
    server.current = current(SUMMER, 2);
    await serverChanged();
    expect(screen.getByText(/You are viewing:/)).toHaveTextContent("You are viewing: Summer 2026");
    expect(screen.getByRole("button", { name: "TripCast: Trips" })).toBeInTheDocument();
    expect(await screen.findByText("Followers now see Summer 2026 (changed on another device).")).toBeInTheDocument();
  });

  it("a device in a private view stays on its trip; only the banner's Followers trip changes", async () => {
    await startApp("traveler", "traveler-token");
    await userEvent.click(screen.getByRole("button", { name: "TripCast: Trips" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Winter 2027/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Open privately" }));
    await settle();
    expect(screen.getByText("Viewing Winter 2027 privately. Followers are viewing Autumn 2026.")).toBeInTheDocument();

    server.current = current(SUMMER, 2);
    await serverChanged();
    expect(screen.getByRole("button", { name: "TripCast: Trips, viewing privately" })).toBeInTheDocument();
    expect(screen.getByText("Viewing Winter 2027 privately. Followers are viewing Summer 2026.")).toBeInTheDocument();
    expect(screen.queryByText(/changed on another device/)).toBeNull();
  });

  it("an open editor keeps its trip after the switch", async () => {
    await startApp("traveler", "traveler-token");
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    const options = await screen.findByRole("dialog");
    await userEvent.click(within(options).getByRole("button", { name: /end trip/i }));
    await settle();
    expect(await screen.findByRole("button", { name: "Close End Trip" })).toBeInTheDocument();
    const credits = () => fake.active().filter((s) => s.name === "endTrip:getTripCredits").map((s) => s.args.tripId);
    expect(credits()).toEqual(["autumn"]);

    server.current = current(SUMMER, 2);
    await serverChanged();
    expect(screen.getByRole("button", { name: "Close End Trip" })).toBeInTheDocument();
    expect(credits()).toEqual(["autumn"]);
  });
});

describe("the trip context and the data it names change in the same render", { timeout: 20_000 }, () => {
  it("no committed render pairs one trip with another trip's untagged data", async () => {
    const commits: Array<{ trip: string | undefined; data: string | undefined }> = [];
    function Probe() {
      const trip = useTripContext().followerTrip?.tripId;
      const latest = useQuery(tripcastApi.liveTrail.getLatestLiveTrailSample, { token: TOKEN });
      const data = latest?._id.replace("-latest", "");
      useEffect(() => {
        commits.push({ trip, data });
      });
      return null;
    }
    fake = createFakeConvexClient((name) => {
      if (name === "followers:getEffectiveTrip") return server.effective;
      if (name === "liveTrail:getLatestLiveTrailSample") return server.effective ? LATEST[server.effective.tripId] : undefined;
      return undefined;
    });
    render(
      <TripContextProvider token={TOKEN} role="follower">
        <Probe />
      </TripContextProvider>,
    );
    await settle();
    for (const next of [SUMMER, AUTUMN, SUMMER]) {
      server.effective = effective(next);
      await serverChanged();
    }
    expect(commits.map(({ trip }) => trip).filter((trip, i, all) => trip !== all[i - 1])).toEqual([
      "autumn",
      "summer",
      "autumn",
      "summer",
    ]);
    expect(commits.filter(({ trip, data }) => trip !== data)).toEqual([]);
  });
});
