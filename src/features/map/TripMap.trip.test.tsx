import React from "react";
import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import * as convexReact from "convex/react";

import {
  tripcastApi,
  type CheckpointMapPin,
  type CurrentTrip,
  type JournalEvent,
  type LiveTrailSample,
} from "../../convex/tripcastApi";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import { setNativePublishingTags } from "../../native/nativePublishingSignal";
import { LivePublishingBridge } from "../../native/LivePublishingBridge";
import TripMap from "./TripMap";
import ReplayDateRangeSheet, { lastCustomRangeKey } from "./ReplayDateRangeSheet";
import { useTripPath } from "./useTripPath";
import { usePendingTrail } from "./usePendingTrail";
import { getLiveTrailCache, resetLiveTrailCachesForTests } from "./liveTrailCache";

// W6: the map shows the viewed trip. TripMap is never keyed by trip: a view change resets and rebinds it in place.

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  // Like the real client, one stable instance across renders.
  client: {} as { query?: unknown },
  easeTo: vi.fn(),
  fitBounds: vi.fn(),
  jumpTo: vi.fn(),
  isNativeLocationAvailable: vi.fn(() => false),
  isAdaptiveLocationAvailable: vi.fn(() => false),
  configure: vi.fn(() => Promise.resolve()),
  snapshot: vi.fn(() => Promise.resolve({ queueRevision: 0, points: [] as unknown[] })),
}));
const markerElements: HTMLElement[] = [];
type MockMapInstance = {
  handlers: Record<string, (event?: unknown) => void>;
  addSource: Mock;
};
const mapInstances: MockMapInstance[] = [];
const voteOverlayOrigins: unknown[] = [];
const checkpointSheetCoordinates: unknown[] = [];

vi.mock("convex/react", () => ({
  useConvex: vi.fn(() => Object.assign(mocks.client, { query: mocks.query })),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("../../providers/BackgroundSaveProvider", () => ({
  useBackgroundSave: () => ({ saves: [], startSave: vi.fn(), retrySave: vi.fn(), dismissSave: vi.fn() }),
  BackgroundSaveProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./useTripPath", () => ({ useTripPath: vi.fn() }));
vi.mock("./usePendingTrail", () => ({ usePendingTrail: vi.fn() }));
vi.mock("./useLiveTrailPath", () => ({ useLiveTrailPath: vi.fn() }));
vi.mock("./useCloakingZones", () => ({ useCloakingZones: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("../../native/locationWatcher", () => ({
  isAdaptiveLocationAvailable: mocks.isAdaptiveLocationAvailable,
  isNativeLocationAvailable: mocks.isNativeLocationAvailable,
  isAdaptiveNativeTrackingActive: () => false,
  openNativeLocationSettings: vi.fn(),
  startNativeLocationWatch: vi.fn(() => vi.fn()),
  stopNativeLocationTracking: vi.fn(() => Promise.resolve()),
  snoozeNativeLocationTracking: vi.fn(() => Promise.resolve()),
  syncNativeMysteryMissions: vi.fn(() => Promise.resolve()),
  configureNativeLocationPublishing: mocks.configure,
  getNativeLocalTrailSnapshot: mocks.snapshot,
  getNativeMysteryNarrationPlaybackState: () => Promise.resolve(null),
  foregroundNativeLocationTracking: vi.fn(),
  retryNativeLocationTracking: vi.fn(() => Promise.resolve()),
}));
vi.mock("maplibre-gl", () => {
  class MockMap {
    handlers: Record<string, (event?: unknown) => void> = {};
    remove = vi.fn();
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    boxZoom = { enable: vi.fn(), disable: vi.fn() };
    dragRotate = { enable: vi.fn(), disable: vi.fn() };
    keyboard = { enable: vi.fn(), disable: vi.fn() };
    doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
    touchZoomRotate = { enable: vi.fn(), disable: vi.fn() };
    constructor() {
      mapInstances.push(this);
    }
    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    setStyle = vi.fn(() => this);
    fitBounds = mocks.fitBounds;
    easeTo = mocks.easeTo;
    jumpTo = mocks.jumpTo;
    on = vi.fn((event: string, handler: (event?: unknown) => void) => {
      this.handlers[event] = handler;
      return this;
    });
    off = vi.fn(() => this);
    once = vi.fn(() => this);
    getLayer = vi.fn(() => false);
    removeLayer = vi.fn();
    getSource = vi.fn(() => false);
    removeSource = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    getZoom = vi.fn(() => 12);
    project = vi.fn(() => ({ x: 120, y: 160 }));
    queryRenderedFeatures = vi.fn(() => []);
    getContainer = vi.fn(() => ({
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    }));
  }
  class MockMarker {
    private element: HTMLElement;
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element ?? document.createElement("div");
      markerElements.push(this.element);
    }
    setLngLat = vi.fn(() => this);
    setPopup = vi.fn(() => this);
    addTo = vi.fn(() => this);
    remove = vi.fn();
    getElement = () => this.element;
  }
  class MockPopup {
    setDOMContent = vi.fn(() => this);
  }
  class MockNavigationControl {}
  return {
    default: { Map: MockMap, Marker: MockMarker, Popup: MockPopup, NavigationControl: MockNavigationControl },
    Marker: MockMarker,
  };
});
vi.mock("./AddCheckpointSheet", () => ({
  default: (props: { selectedCoordinate: unknown }) => {
    checkpointSheetCoordinates.push(props.selectedCoordinate);
    return null;
  },
}));
vi.mock("./RouteVoteMapOverlay", () => ({
  default: (props: { fallbackOrigin: unknown }) => {
    voteOverlayOrigins.push(props.fallbackOrigin);
    return null;
  },
}));
vi.mock("./MissionMarkers", () => ({ default: () => null }));
vi.mock("../routevote/RouteVotePanel", () => ({ default: () => null }));
vi.mock("../journal/JournalSheet", () => ({ default: () => <div data-testid="journal-sheet" /> }));
vi.mock("../travelfunds/TravelFundsSheet", () => ({ default: () => <div data-testid="funds-sheet" /> }));

const TOKEN = "test-token";
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
const SUMMER = { tripId: "trip-summer", title: "Summer 2026" };
const LEGACY: CurrentTrip = { ...AUTUMN, tripId: "trip-legacy", title: "First trip", isLegacy: true };
const NO_TRIP = "untagged";

function pin(id: string, lat: number, lon: number): CheckpointMapPin {
  return { _id: id, lat, lon, createdAt: 1_000 };
}
function sample(id: string, lat: number, lon: number, sampledAt: number): LiveTrailSample {
  return { _id: id, lat, lon, sampledAt };
}
function story(id: string, checkpointId: string, title: string): JournalEvent {
  return {
    _id: id,
    _creationTime: 1,
    type: "story",
    narrativeLevel: "activity",
    occurredAt: 1_000,
    createdAt: 1,
    title,
    body: `${title} body`,
    checkpointId,
    lat: 47.6,
    lon: -122.3,
  };
}

const AUTUMN_PIN = pin("pin-autumn", 47.6, -122.3);
const SUMMER_PIN = pin("pin-summer", 40.7, -74.0);
const AUTUMN_STORY = story("story-autumn", AUTUMN_PIN._id, "Autumn story");
const SUMMER_STORY = story("story-summer", SUMMER_PIN._id, "Summer story");
const LIVE = { lat: 47.62, lon: -122.34 };

function following(current: CurrentTrip = AUTUMN, extra: Partial<TripContextValue> = {}): Partial<TripContextValue> {
  return {
    role: "traveler",
    currentTrip: current,
    followerTrip: current,
    multiTripEnabled: true,
    viewingMode: "follow_current",
    viewingTripId: current.tripId,
    viewingTrip: { tripId: current.tripId, title: current.title },
    ...extra,
  };
}
function viewingSummer(extra: Partial<TripContextValue> = {}): Partial<TripContextValue> {
  return { ...following(AUTUMN), viewingMode: "private", viewingTripId: SUMMER.tripId, viewingTrip: SUMMER, ...extra };
}

let pinsByTrip: Record<string, CheckpointMapPin[] | undefined> = {};
let latestByTrip: Record<string, LiveTrailSample | null> = {};
// Stable results, as Convex returns them (the sampler effect re-runs when they change identity).
const LIVE_TRAIL_STATUS = { enabled: true, visibleToFollowers: false };
const TRAVELER_PREFERENCES = { travelerTimeZone: "UTC" };
let journalByTrip: Record<string, JournalEvent[] | undefined> = {};
let nativeMysteryRevision: { revision: number } | null = null;
const useQueryMock = convexReact.useQuery as unknown as Mock<(query: unknown, args: unknown) => unknown>;
const useMutationMock = convexReact.useMutation as unknown as Mock<(mutation: unknown) => unknown>;
const tripOf = (args: unknown) => (args as { tripId?: string } | undefined)?.tripId ?? NO_TRIP;

function setupQueries() {
  useQueryMock.mockImplementation((query, args) => {
    if (args === "skip") return undefined;
    if (query === tripcastApi.checkpoints.listCheckpointMapPins) return pinsByTrip[tripOf(args)];
    if (query === tripcastApi.journalEvents.listJournalEvents) {
      return tripOf(args) in journalByTrip ? journalByTrip[tripOf(args)] : [];
    }
    if (query === tripcastApi.journalEvents.getJournalUnreadCount) return 0;
    if (query === tripcastApi.liveTrail.travelerGetLiveTrailStatus) return LIVE_TRAIL_STATUS;
    if (query === tripcastApi.liveTrail.getLatestLiveTrailSample) return latestByTrip[tripOf(args)] ?? null;
    if (query === tripcastApi.travelerPreferences.travelerGetPreferences) return TRAVELER_PREFERENCES;
    if (query === tripcastApi.travelerState.travelerGetState) return { state: null, visibility: null };
    if (query === tripcastApi.mysteryMissions.listMysteryMissionMapPins) return { rows: [] };
    if (query === tripcastApi.mysteryMissions.travelerGetNativeMysteryMissionRevision) return nativeMysteryRevision;
    if (query === tripcastApi.routeVotes.travelerListRouteVotes) return [];
    if (query === tripcastApi.travelFunds.travelerGetConfig) {
      return { enabled: true, featureEnabled: true, startingBudgetUsd: 100, remainingUsd: 75, spentUsd: 25 };
    }
    return null;
  });
}

const MANIFEST = { revision: 0, ready: false, enabled: false, visible: true, cutoff: null, authorization: "test", ended: false };
let breadcrumbsByTrip: Record<string, LiveTrailSample[]> = {};
let manifestFor: (tripId: string) => Promise<unknown> = async () => MANIFEST;
let resumeTargetFor: (tripId: string) => Promise<unknown> = async () => null;
let storyByCheckpoint: (checkpointId: string) => Promise<JournalEvent | null> = async (checkpointId) =>
  [AUTUMN_STORY, SUMMER_STORY].find((event) => event.checkpointId === checkpointId) ?? null;

type PageArgs = { checkpointId?: string; startAt?: number; endAt?: number; direction?: "asc" | "desc" };
function page(rows: LiveTrailSample[], args: PageArgs) {
  const startAt = args.startAt ?? Number.NEGATIVE_INFINITY;
  const endAt = args.endAt ?? Number.POSITIVE_INFINITY;
  const direction = args.direction ?? "asc";
  const matching = rows
    .filter((row) => row.sampledAt >= startAt && row.sampledAt <= endAt)
    .sort((a, b) => (direction === "asc" ? a.sampledAt - b.sampledAt : b.sampledAt - a.sampledAt));
  return {
    page: matching,
    hasMore: false,
    reachedTrueEnd: true,
    continueCursor: "done",
    effectiveStartAt: Number.isFinite(startAt) ? startAt : null,
    effectiveEndAt: Number.isFinite(endAt) ? endAt : null,
    scanBoundaryAt: matching.at(-1)?.sampledAt ?? (direction === "asc" ? endAt : startAt),
  };
}
function setupImperativeQueries() {
  mocks.query.mockImplementation(async (query: unknown, args: PageArgs) => {
    if (query === tripcastApi.replayRoutes.manifest) return manifestFor(tripOf(args));
    if (query === tripcastApi.liveTrail.listReplayLiveTrailSamples) return page(breadcrumbsByTrip[tripOf(args)] ?? [], args);
    if (query === tripcastApi.journalEvents.listReplayStoryEvents) return page([], args);
    if (query === tripcastApi.journalEvents.getStoryEventByCheckpoint) return storyByCheckpoint(args.checkpointId ?? "");
    if (query === tripcastApi.journalEvents.resolveReplayResumeTarget) return resumeTargetFor(tripOf(args));
    if (query === tripcastApi.mysteryMissions.travelerGetNativeMysteryMissionSync) return { revision: 7, debugIncluded: false };
    return null;
  });
}

const updateTravelerLocation = vi.fn();
const recordLiveTrailSample = vi.fn();
const deleteBreadcrumb = vi.fn();
const reopenTrip = vi.fn();
let emitFix: (lat: number, lon: number) => void = () => {};

let tripContext: Partial<TripContextValue> = {};
function Wrapper({ children }: { children: React.ReactNode }) {
  return <TripContextTestProvider value={tripContext}>{children}</TripContextTestProvider>;
}
function renderMap(trip: Partial<TripContextValue>, { withBridge = false }: { withBridge?: boolean } = {}) {
  tripContext = trip;
  const ui = (
    <>
      {withBridge ? <LivePublishingBridge token={TOKEN} role="traveler" gpsSuppressedUntil={null} /> : null}
      <TripMap token={TOKEN} role="traveler" />
    </>
  );
  const result = rtlRender(ui, { wrapper: Wrapper });
  return {
    ...result,
    view(next: Partial<TripContextValue>) {
      tripContext = next;
      result.rerender(ui);
    },
  };
}

/** Args of every call of `mock` with `ref` first (compared by identity: the refs are proxies the printer cannot show). */
const argsOf = (mock: Mock, ref: unknown) => mock.mock.calls.filter(([first]) => first === ref).map(([, args]) => args);
const tripIdsOf = (mock: Mock, ref: unknown) => argsOf(mock, ref).map(tripOf);
const pathCalls = () => vi.mocked(useTripPath).mock.calls;
const lastPath = () => pathCalls().at(-1)!;
const ids = (rows: unknown) => (rows as Array<{ _id: string }>).map((row) => row._id);
const travelerMarkers = () => markerElements.filter((el) => el.className.includes("traveler-location-marker"));
const accuracySources = () => mapInstances.flatMap((map) => map.addSource.mock.calls).filter(([id]) => id === "accuracy-circle");
const cache = (tripKey: string | null) => getLiveTrailCache(TOKEN, "traveler", tripKey);

async function startReplay() {
  await userEvent.click(screen.getByRole("button", { name: "Replay" }));
  await userEvent.click(await screen.findByRole("button", { name: /Start from beginning/i }));
  return screen.findByRole("group", { name: "Trip Replay" });
}

beforeEach(async () => {
  await resetLiveTrailCachesForTests();
  vi.clearAllMocks();
  localStorage.clear();
  markerElements.length = 0;
  mapInstances.length = 0;
  voteOverlayOrigins.length = 0;
  checkpointSheetCoordinates.length = 0;
  pinsByTrip = { [AUTUMN.tripId]: [AUTUMN_PIN], [SUMMER.tripId]: [SUMMER_PIN], [NO_TRIP]: [], [LEGACY.tripId]: [] };
  latestByTrip = {};
  journalByTrip = { [AUTUMN.tripId]: [AUTUMN_STORY], [SUMMER.tripId]: [SUMMER_STORY] };
  breadcrumbsByTrip = {
    [AUTUMN.tripId]: [sample("autumn-crumb-1", 47.61, -122.31, 1_000), sample("autumn-crumb-2", 47.62, -122.32, 9_000)],
    [SUMMER.tripId]: [sample("summer-crumb-1", 40.71, -74.01, 2_000), sample("summer-crumb-2", 40.72, -74.02, 9_500)],
  };
  manifestFor = async () => MANIFEST;
  resumeTargetFor = async () => null;
  storyByCheckpoint = async (checkpointId) =>
    [AUTUMN_STORY, SUMMER_STORY].find((event) => event.checkpointId === checkpointId) ?? null;
  nativeMysteryRevision = null;
  mocks.isNativeLocationAvailable.mockReturnValue(false);
  mocks.isAdaptiveLocationAvailable.mockReturnValue(false);
  mocks.configure.mockResolvedValue(undefined);
  mocks.snapshot.mockResolvedValue({ queueRevision: 0, points: [] });
  updateTravelerLocation.mockResolvedValue(null);
  recordLiveTrailSample.mockResolvedValue(null);
  deleteBreadcrumb.mockResolvedValue({ deleted: 1 });
  reopenTrip.mockResolvedValue(null);
  setupQueries();
  setupImperativeQueries();
  useMutationMock.mockImplementation((mutation) => {
    if (mutation === tripcastApi.travelerLocations.updateTravelerLocation) return updateTravelerLocation;
    if (mutation === tripcastApi.liveTrail.travelerRecordLiveTrailSample) return recordLiveTrailSample;
    if (mutation === tripcastApi.liveTrail.travelerDeleteLiveTrailSamples) return deleteBreadcrumb;
    if (mutation === tripcastApi.endTrip.travelerReopenTrip) return reopenTrip;
    return vi.fn().mockResolvedValue(null);
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((onSuccess: (position: unknown) => void) => {
        emitFix = (lat, lon) => onSuccess({ coords: { latitude: lat, longitude: lon, accuracy: 9 } });
        emitFix(LIVE.lat, LIVE.lon);
        return 42;
      }),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    },
  });
});

afterEach(() => {
  setNativePublishingTags(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("TripMap follows the viewed trip", () => {
  it("reads follow the viewed trip; the publisher's reads and the phone's missions stay on the shared trip", async () => {
    mocks.isAdaptiveLocationAvailable.mockReturnValue(true);
    nativeMysteryRevision = { revision: 7 };
    renderMap(viewingSummer());

    await waitFor(() => {
      expect(tripIdsOf(mocks.query, tripcastApi.mysteryMissions.travelerGetNativeMysteryMissionSync)).toEqual([AUTUMN.tripId]);
    });
    expect(argsOf(useQueryMock, tripcastApi.checkpoints.listCheckpointMapPins)).toContainEqual({ token: TOKEN, tripId: SUMMER.tripId });
    expect(argsOf(useQueryMock, tripcastApi.messages.listMessages)).toContainEqual({ token: TOKEN, tripId: SUMMER.tripId });
    expect(new Set(tripIdsOf(useQueryMock, tripcastApi.liveTrail.travelerGetLiveTrailStatus))).toEqual(new Set([AUTUMN.tripId]));
    expect(new Set(tripIdsOf(useQueryMock, tripcastApi.liveTrail.getLatestLiveTrailSample))).toEqual(new Set([AUTUMN.tripId]));
  });

  it("multi-trip off: every read is exactly today's request (no trip id)", () => {
    renderMap({});
    for (const ref of [
      tripcastApi.checkpoints.listCheckpointMapPins,
      tripcastApi.liveTrail.travelerGetLiveTrailStatus,
      tripcastApi.liveTrail.getLatestLiveTrailSample,
      tripcastApi.replayRoutes.manifest,
    ]) {
      expect(argsOf(useQueryMock, ref).length).toBeGreaterThan(0);
      for (const args of argsOf(useQueryMock, ref)) expect(args).toStrictEqual({ token: TOKEN });
    }
  });

  it("a view change swaps pins and trail to the new trip and never renders the old trip's trail with it", async () => {
    cache(AUTUMN.tripId).replaceReplay([sample("autumn-trail", 47.6, -122.3, 500)]);
    cache(SUMMER.tripId).replaceReplay([sample("summer-trail", 40.7, -74.0, 600)]);
    // The latest sample is the shared trip's (Autumn) in both views; it never joins Summer's trail.
    latestByTrip[AUTUMN.tripId] = sample("autumn-latest", 47.61, -122.31, 700);
    const map = renderMap(following());
    await waitFor(() => {
      expect(lastPath()[1]).toEqual([AUTUMN_PIN]);
      expect(ids(lastPath()[6])).toEqual(["autumn-trail", "autumn-latest"]);
    });
    vi.mocked(useTripPath).mockClear();

    map.view(viewingSummer());

    await waitFor(() => {
      expect(lastPath()[1]).toEqual([SUMMER_PIN]);
      expect(ids(lastPath()[6])).toEqual(["summer-trail"]);
    });
    for (const call of pathCalls()) {
      if ((call[1] as CheckpointMapPin[]).some((row) => row._id === SUMMER_PIN._id)) {
        expect(ids(call[6])).not.toContain("autumn-trail");
      }
    }
    expect(ids(cache(SUMMER.tripId).snapshot().samples)).toEqual(["summer-trail"]);
    expect(ids(cache(AUTUMN.tripId).snapshot().samples)).toEqual(["autumn-trail", "autumn-latest"]);
  });

  it("a view change stops the old trip's replay, keeps its breadcrumbs out of the new trip's cache, and replays the new trip", async () => {
    cache(SUMMER.tripId).replaceReplay([sample("summer-trail", 40.7, -74.0, 600)]);
    const map = renderMap(following());
    await startReplay();
    await waitFor(() => expect(ids(cache(AUTUMN.tripId).snapshot().replay)).toEqual(["autumn-crumb-1", "autumn-crumb-2"]));

    map.view(viewingSummer());

    await waitFor(() => expect(screen.queryByRole("group", { name: "Trip Replay" })).not.toBeInTheDocument());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    expect(ids(cache(SUMMER.tripId).snapshot().samples)).toEqual(["summer-trail"]);
    expect(ids(cache(AUTUMN.tripId).snapshot().replay)).toEqual(["autumn-crumb-1", "autumn-crumb-2"]);

    mocks.query.mockClear();
    await startReplay();
    const pagedTrips = tripIdsOf(mocks.query, tripcastApi.liveTrail.listReplayLiveTrailSamples);
    expect(pagedTrips.length).toBeGreaterThan(0);
    expect(new Set(pagedTrips)).toEqual(new Set([SUMMER.tripId]));
  });

  it("a breadcrumb deleted in a replay after a view change is deleted from the trip shown, which the confirmation names", async () => {
    const map = renderMap(following());
    await startReplay();
    fireEvent.click(screen.getByRole("button", { name: /pause replay/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete trail sample?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));

    await startReplay();
    fireEvent.click(screen.getByRole("button", { name: /pause replay/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete trail sample from Summer 2026?")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => expect(deleteBreadcrumb).toHaveBeenCalledWith({
      token: TOKEN,
      sampleIds: ["summer-crumb-1"],
      tripId: SUMMER.tripId,
    }));
  });

  it("ignores a story pin answer that arrives after the view changed, then opens the new trip's pins", async () => {
    let resolveLate: (event: JournalEvent | null) => void = () => {};
    let deferAutumn = false;
    storyByCheckpoint = (checkpointId) => {
      if (checkpointId !== AUTUMN_PIN._id) return Promise.resolve(SUMMER_STORY);
      if (!deferAutumn) return Promise.resolve(AUTUMN_STORY);
      return new Promise((resolve) => { resolveLate = resolve; });
    };
    const pinMarker = () => markerElements.filter((el) => el.style.cursor === "pointer").at(-1)!;
    const map = renderMap(following());
    await waitFor(() => expect(markerElements.some((el) => el.style.cursor === "pointer")).toBe(true));
    fireEvent.click(pinMarker());
    expect(await screen.findByText("Autumn story")).toBeInTheDocument();
    deferAutumn = true;
    fireEvent.click(pinMarker());

    // Right after the change the new trip's journal is still loading, when a stale story would show as a fallback.
    journalByTrip[SUMMER.tripId] = undefined;
    map.view(viewingSummer());
    await waitFor(() => expect(screen.queryByText("Autumn story")).not.toBeInTheDocument());
    const journalReadsBefore = argsOf(useQueryMock, tripcastApi.journalEvents.listJournalEvents).length;
    await act(async () => resolveLate(AUTUMN_STORY));

    // A story selection would subscribe the journal; the late answer must leave the selection empty.
    expect(argsOf(useQueryMock, tripcastApi.journalEvents.listJournalEvents).slice(journalReadsBefore)).not.toContainEqual(
      expect.objectContaining({ token: TOKEN }),
    );
    expect(screen.queryByText("Autumn story")).not.toBeInTheDocument();

    journalByTrip[SUMMER.tripId] = [SUMMER_STORY];
    map.view(viewingSummer());
    fireEvent.click(pinMarker());
    expect(await screen.findByText("Summer story")).toBeInTheDocument();
    expect(argsOf(mocks.query, tripcastApi.journalEvents.getStoryEventByCheckpoint)).toContainEqual(
      { token: TOKEN, checkpointId: SUMMER_PIN._id, tripId: SUMMER.tripId },
    );
  });

  it("does not start the old trip's replay when its manifest arrives after the view changed", async () => {
    let resolveManifest: (manifest: unknown) => void = () => {};
    let deferred = false;
    manifestFor = (tripId) => {
      if (tripId !== AUTUMN.tripId || deferred) return Promise.resolve(MANIFEST);
      deferred = true;
      return new Promise((resolve) => { resolveManifest = resolve; });
    };
    const map = renderMap(following());
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    await userEvent.click(await screen.findByRole("button", { name: /Start from beginning/i }));

    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    await act(async () => resolveManifest(MANIFEST));

    expect(argsOf(mocks.query, tripcastApi.liveTrail.listReplayLiveTrailSamples)).toEqual([]);
    expect(screen.queryByRole("group", { name: "Trip Replay" })).not.toBeInTheDocument();
  });

  it("does not continue the old trip's replay when its resume point arrives after the view changed", async () => {
    let resolveResume: (target: unknown) => void = () => {};
    resumeTargetFor = (tripId) =>
      tripId === AUTUMN.tripId ? new Promise((resolve) => { resolveResume = resolve; }) : Promise.resolve(null);
    localStorage.setItem(
      `tripcast.replay.lastPin.${TOKEN}.${AUTUMN.tripId}`,
      JSON.stringify({ version: 2, eventId: "autumn-crumb-2", index: 1, occurredAt: 9_000, source: { mode: "beginning", endAt: 10_000 } }),
    );
    const map = renderMap(following());
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    await userEvent.click(await screen.findByRole("button", { name: /Continue where you left off/i }));
    await waitFor(() => expect(argsOf(mocks.query, tripcastApi.journalEvents.resolveReplayResumeTarget)).toHaveLength(1));

    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    await act(async () => resolveResume({ eventId: "autumn-crumb-2", occurredAt: 9_000 }));
    await act(async () => {});

    expect(argsOf(mocks.query, tripcastApi.liveTrail.listReplayLiveTrailSamples)).toEqual([]);
    expect(screen.queryByRole("group", { name: "Trip Replay" })).not.toBeInTheDocument();
  });

  it("reports a privately viewed trip that no longer exists when its replay fails with trip_not_found", async () => {
    const reportTripUnavailable = vi.fn();
    manifestFor = async () => {
      throw Object.assign(new Error("[trip_not_found]"), { data: { code: "trip_not_found", message: "Trip not found" } });
    };
    renderMap(viewingSummer({ reportTripUnavailable }));
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    await userEvent.click(await screen.findByRole("button", { name: /Start from beginning/i }));

    await waitFor(() => expect(reportTripUnavailable).toHaveBeenCalledWith(SUMMER.tripId));
  });
});

describe("TripMap private view and the live Traveler", () => {
  it("private view renders no live marker, accuracy circle, device trail or live origin; returning restores them", async () => {
    mocks.isAdaptiveLocationAvailable.mockReturnValue(true);
    mocks.snapshot.mockResolvedValue({
      queueRevision: 1,
      points: [
        { clientSampleId: "device-ack", lat: 47.63, lon: -122.35, sampledAt: 2_000, status: "acknowledged" },
        { clientSampleId: "device-pending", lat: 47.64, lon: -122.36, sampledAt: 3_000, status: "pending" },
      ],
    });
    const map = renderMap(viewingSummer());
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalled());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));

    expect(travelerMarkers()).toHaveLength(0);
    expect(accuracySources()).toHaveLength(0);
    for (const call of pathCalls()) expect((call[6] as Array<{ sampledAt: number }>).map((row) => row.sampledAt)).not.toContain(2_000);
    for (const call of vi.mocked(usePendingTrail).mock.calls) expect(call[1]).toEqual([]);
    expect(voteOverlayOrigins.at(-1)).toEqual({ lat: SUMMER_PIN.lat, lon: SUMMER_PIN.lon });
    // Launch centering never jumps a private view to today's position.
    expect(mocks.jumpTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] }));

    map.view(following());

    await waitFor(() => expect(travelerMarkers().length).toBeGreaterThan(0));
    expect(accuracySources().length).toBeGreaterThan(0);
    await waitFor(() => {
      expect((lastPath()[6] as Array<{ sampledAt: number }>).map((row) => row.sampledAt)).toContain(2_000);
      expect(vi.mocked(usePendingTrail).mock.calls.at(-1)![1]).toEqual([expect.objectContaining({ clientSampleId: "device-pending" })]);
    });
    expect(voteOverlayOrigins.at(-1)).toEqual(expect.objectContaining(LIVE));
  });

  it("drops the follow camera on a private view, never follows or centers on today's position there, and moves to the trip once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    localStorage.setItem("tripcast.live-sharing.enabled", "true");
    const map = renderMap(following());
    await waitFor(() => expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] })));
    await waitFor(() => expect(lastPath()[2]).toEqual(expect.objectContaining(LIVE)));
    mocks.easeTo.mockClear();
    // Past the window in which a repeated ease to the same spot is suppressed.
    vi.setSystemTime(Date.now() + 1_000);

    map.view(viewingSummer());
    await waitFor(() => expect(mocks.fitBounds).toHaveBeenCalledTimes(1));
    expect(mocks.easeTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] }));
    expect(mocks.fitBounds).toHaveBeenCalledWith(
      [[SUMMER_PIN.lon, SUMMER_PIN.lat], [SUMMER_PIN.lon, SUMMER_PIN.lat]],
      expect.objectContaining({ animate: false }),
    );
    expect(lastPath()[2]).toBeNull();

    mocks.easeTo.mockClear();
    act(() => emitFix(47.7, -122.4));
    fireEvent.click(screen.getByRole("button", { name: "Center map on traveler" }));

    expect(mocks.easeTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [-122.4, 47.7] }));
    expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [SUMMER_PIN.lon, SUMMER_PIN.lat] }));
    pinsByTrip[SUMMER.tripId] = [SUMMER_PIN, pin("pin-summer-2", 40.8, -74.1)];
    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toHaveLength(2));
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("the first trip id after the trip state loads is not a view change", async () => {
    const map = renderMap({ serverTripStatus: "loading" });
    await waitFor(() => expect(mocks.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] })));
    mocks.easeTo.mockClear();

    map.view(following());
    await waitFor(() => expect(lastPath()[1]).toEqual([AUTUMN_PIN]));
    act(() => emitFix(47.7, -122.4));

    expect(mocks.fitBounds).not.toHaveBeenCalled();
    // Still following the Traveler from launch.
    await waitFor(() => expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-122.4, 47.7] })));
  });

  it("Check In uses today's position only on the shared trip; a private view picks the spot on the map", async () => {
    const privateMap = renderMap(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /check in/i }));
    expect(checkpointSheetCoordinates.at(-1)).toBeNull();
    expect(mocks.easeTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] }));
    privateMap.unmount();

    renderMap(following());
    await waitFor(() => expect(lastPath()[1]).toEqual([AUTUMN_PIN]));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /check in/i }));
    expect(checkpointSheetCoordinates.at(-1)).toEqual(expect.objectContaining(LIVE));
  });

  it("a user pan before the new trip's pins arrive cancels the move to them", async () => {
    pinsByTrip[SUMMER.tripId] = undefined;
    const map = renderMap(following());
    await waitFor(() => expect(lastPath()[1]).toEqual([AUTUMN_PIN]));

    map.view(viewingSummer());
    act(() => mapInstances[0].handlers.dragstart?.());
    pinsByTrip[SUMMER.tripId] = [SUMMER_PIN];
    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));

    expect(mocks.fitBounds).not.toHaveBeenCalled();
  });

  it("does not restore the follow camera onto a private view after the app resumes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    const map = renderMap(following());
    await waitFor(() => expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] })));
    act(() => mapInstances[0].handlers.dragstart?.());
    map.view(viewingSummer());
    mocks.easeTo.mockClear();
    // Inside the 2 s restore grace, past the window in which a repeated ease to the same spot is suppressed.
    vi.setSystemTime(Date.now() + 1_000);

    visibility = "hidden";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    expect(mocks.easeTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [LIVE.lon, LIVE.lat] }));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
});

describe("TripMap publishing across a view change", () => {
  it("never reconfigures the publishing bridge and keeps publishing with the shared trip's tags", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("VITE_CONVEX_URL", "https://example.invalid");
    mocks.isAdaptiveLocationAvailable.mockReturnValue(true);
    localStorage.setItem("tripcast.live-sharing.enabled", "true");
    const map = renderMap(following(), { withBridge: true });
    await waitFor(() => expect(mocks.configure).toHaveBeenCalled());
    await waitFor(() => expect(updateTravelerLocation).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: AUTUMN.tripId, publishingEpoch: AUTUMN.publishingEpoch }),
    ));
    await waitFor(() => expect(recordLiveTrailSample).toHaveBeenCalled());
    const configured = mocks.configure.mock.calls.length;
    const recorded = recordLiveTrailSample.mock.calls.length;

    map.view(viewingSummer());
    await waitFor(() => expect(lastPath()[1]).toEqual([SUMMER_PIN]));
    // The GPS sampler keeps its state across the view change: the same spot again is not a new trail sample.
    act(() => emitFix(LIVE.lat, LIVE.lon));
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(recorded);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    act(() => emitFix(47.7, -122.4));
    map.view(following());
    await waitFor(() => expect(lastPath()[1]).toEqual([AUTUMN_PIN]));

    expect(mocks.configure).toHaveBeenCalledTimes(configured);
    await waitFor(() => expect(updateTravelerLocation).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 47.7, lon: -122.4, tripId: AUTUMN.tripId, publishingEpoch: AUTUMN.publishingEpoch }),
    ));
    for (const [args] of updateTravelerLocation.mock.calls) expect(args).toHaveProperty("tripId", AUTUMN.tripId);
  });

  it("Reopen asks once, naming the shared trip, reopens it and does not start sharing", async () => {
    renderMap(following({ ...AUTUMN, lifecycle: "completed" }));
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    expect(await screen.findByText("Reopen Autumn 2026?")).toBeInTheDocument();
    expect(reopenTrip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reopen trip" }));

    await waitFor(() => expect(reopenTrip).toHaveBeenCalledWith({ token: TOKEN, tripId: AUTUMN.tripId }));
    expect(reopenTrip).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Autumn 2026 reopened. Tap Live to go live.")).toBeInTheDocument();
    expect(localStorage.getItem("tripcast.live-sharing.enabled")).not.toBe("true");
    expect(updateTravelerLocation).not.toHaveBeenCalled();
  });
});

describe("TripMap trip-keyed client state", () => {
  const resume = (eventId: string) =>
    JSON.stringify({ version: 2, eventId, index: 0, occurredAt: 1_000, source: { mode: "beginning", endAt: 10_000 } });
  const continueButton = () => screen.findByRole("button", { name: /Continue where you left off/i });

  it("the Legacy Trip keeps today's trail cache and replay resume keys", async () => {
    cache(null).replaceReplay([sample("legacy-trail", 47.6, -122.3, 500)]);
    cache(LEGACY.tripId).replaceReplay([sample("keyed-trail", 47.6, -122.3, 600)]);
    localStorage.setItem(`tripcast.replay.lastPin.${TOKEN}`, resume("legacy-story"));
    renderMap(following(LEGACY));

    await waitFor(() => expect(ids(lastPath()[6])).toEqual(["legacy-trail"]));
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(await continueButton()).toBeEnabled();
  });

  it("keeps two trips' trail caches and replay resume points apart", async () => {
    cache(null).replaceReplay([sample("legacy-trail", 47.6, -122.3, 500)]);
    localStorage.setItem(`tripcast.replay.lastPin.${TOKEN}.${SUMMER.tripId}`, resume("summer-story"));
    const map = renderMap(following());
    await waitFor(() => expect(lastPath()[1]).toEqual([AUTUMN_PIN]));
    expect(ids(lastPath()[6])).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(await continueButton()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Start from beginning/i }));
    await waitFor(() => expect(localStorage.getItem(`tripcast.replay.lastPin.${TOKEN}.${AUTUMN.tripId}`)).toContain("autumn-crumb"));
    expect(localStorage.getItem(`tripcast.replay.lastPin.${TOKEN}`)).toBeNull();

    map.view(viewingSummer());
    await waitFor(() => expect(screen.queryByRole("group", { name: "Trip Replay" })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(await continueButton()).toBeEnabled();
    expect(localStorage.getItem(`tripcast.replay.lastPin.${TOKEN}.${SUMMER.tripId}`)).toContain("summer-story");
  });

  it("remembers the last custom replay range per trip; the Legacy Trip and no trip use today's key", async () => {
    const DAY = Date.UTC(2026, 6, 1);
    localStorage.setItem(lastCustomRangeKey(), JSON.stringify({ startAt: DAY, endAt: DAY + 3_600_000 }));
    localStorage.setItem(lastCustomRangeKey(SUMMER.tripId), JSON.stringify({ startAt: DAY + 86_400_000, endAt: DAY + 90_000_000 }));
    const props = { open: true, bounds: null, window: null, timeZone: "UTC", onApply: vi.fn(), onReset: vi.fn(), onClose: vi.fn() };

    const summer = rtlRender(<ReplayDateRangeSheet {...props} tripKey={SUMMER.tripId} />);
    expect(await screen.findByDisplayValue("2026-07-02T00:00")).toBeInTheDocument();
    summer.unmount();
    const autumn = rtlRender(<ReplayDateRangeSheet {...props} tripKey={AUTUMN.tripId} />);
    expect(screen.queryByDisplayValue("2026-07-01T00:00")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-08-01T10:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-08-01T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(JSON.parse(localStorage.getItem(lastCustomRangeKey(AUTUMN.tripId))!)).toEqual({
      startAt: Date.UTC(2026, 7, 1, 10),
      endAt: Date.UTC(2026, 7, 1, 12),
    });
    autumn.unmount();
    rtlRender(<ReplayDateRangeSheet {...props} tripKey={null} />);
    expect(await screen.findByDisplayValue("2026-07-01T00:00")).toBeInTheDocument();
    expect(lastCustomRangeKey(null)).toBe("tripcast.replay.lastCustomRange");
  });
});
