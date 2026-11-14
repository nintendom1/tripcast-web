import React from "react";
import { act, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type CurrentTrip, type Mission } from "../../convex/tripcastApi";
import type { PendingSave } from "../../lib/idb";
import type { BackgroundSaveNotice } from "../../providers/BackgroundSaveProvider";
import { TripContextTestProvider } from "../../providers/TripContextProvider";
import type { TripContextValue } from "../trips/tripTypes";
import MissionDetailSheet from "../missions/MissionDetailSheet";
import TripMap from "./TripMap";

// W11A: a queued Story names the trip its form was OPENED on, and Retry re-sends the queued save instead of reopening an
// empty form. The Story form itself is a stub that records its props; the save queue is a stub that records its calls.

const bg = vi.hoisted(() => ({
  saves: [] as PendingSave[],
  notices: [] as BackgroundSaveNotice[],
  startSave: vi.fn(),
  retrySave: vi.fn(),
  dismissSave: vi.fn(),
  dismissNotice: vi.fn(),
}));
const sheet = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
const mapHandlers = vi.hoisted(() => [] as Array<Record<string, (event?: unknown) => void>>);
const MISSION = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "Exhausted", isLoading: false, loadMore: vi.fn() })),
  useConvex: vi.fn(() => ({ query: vi.fn(async () => null), mutation: vi.fn(async () => null), action: vi.fn(async () => null) })),
  useMutation: vi.fn(() => vi.fn(async () => null)),
  useQuery: vi.fn(),
}));
vi.mock("../../providers/BackgroundSaveProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../providers/BackgroundSaveProvider")>()),
  useBackgroundSave: () => bg,
  BackgroundSaveProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./useTripPath", () => ({ useTripPath: vi.fn() }));
vi.mock("./usePendingTrail", () => ({ usePendingTrail: vi.fn() }));
vi.mock("./useLiveTrailPath", () => ({ useLiveTrailPath: vi.fn() }));
vi.mock("./useCloakingZones", () => ({ useCloakingZones: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("../../native/locationWatcher", () => ({
  isAdaptiveLocationAvailable: () => false,
  isNativeLocationAvailable: () => false,
  isAdaptiveNativeTrackingActive: () => false,
  openNativeLocationSettings: vi.fn(),
  startNativeLocationWatch: vi.fn(() => vi.fn()),
  stopNativeLocationTracking: vi.fn(() => Promise.resolve()),
  snoozeNativeLocationTracking: vi.fn(() => Promise.resolve()),
  syncNativeMysteryMissions: vi.fn(() => Promise.resolve()),
  configureNativeLocationPublishing: vi.fn(() => Promise.resolve()),
  getNativeLocalTrailSnapshot: vi.fn(() => Promise.resolve({ queueRevision: 0, points: [] })),
  getNativeMysteryNarrationPlaybackState: () => Promise.resolve(null),
  foregroundNativeLocationTracking: vi.fn(),
  retryNativeLocationTracking: vi.fn(() => Promise.resolve()),
}));
vi.mock("maplibre-gl", () => {
  const enabler = () => ({ enable: vi.fn(), disable: vi.fn() });
  class MockMap {
    handlers: Record<string, (event?: unknown) => void> = {};
    dragPan = enabler();
    scrollZoom = enabler();
    boxZoom = enabler();
    dragRotate = enabler();
    keyboard = enabler();
    doubleClickZoom = enabler();
    touchZoomRotate = enabler();
    constructor() {
      mapHandlers.push(this.handlers);
    }
    remove = vi.fn();
    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    setStyle = vi.fn(() => this);
    fitBounds = vi.fn();
    easeTo = vi.fn();
    jumpTo = vi.fn();
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
    private element = document.createElement("div");
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
  default: (props: Record<string, unknown>) => {
    sheet.props.push(props);
    return null;
  },
}));
// The missions panel shows one mission's detail (the real sheet), mounted with the map.
vi.mock("../missions/MissionPanel", () => ({
  default: (props: { token: string; onCompleteAsStory?: (mission: Mission) => void }) => MISSION.current === null ? null : (
    <MissionDetailSheet
      Mission={MISSION.current as Mission}
      token={props.token}
      role="traveler"
      onClose={() => {}}
      onCompleteAsStory={props.onCompleteAsStory}
    />
  ),
}));
vi.mock("../travelfunds/LinkedTransactionsSection", () => ({ default: () => null }));
vi.mock("./RouteVoteMapOverlay", () => ({ default: () => null }));
vi.mock("./MissionMarkers", () => ({ default: () => null }));
vi.mock("../routevote/RouteVotePanel", () => ({ default: () => null }));
vi.mock("../journal/JournalSheet", () => ({ default: () => null }));
vi.mock("../travelfunds/TravelFundsSheet", () => ({ default: () => null }));

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
const WINTER: CurrentTrip = { ...AUTUMN, tripId: "trip-winter", title: "Winter 2027", publishingEpoch: 4 };
const SUMMER = { tripId: "trip-summer", title: "Summer 2026" };

function following(current: CurrentTrip = AUTUMN): Partial<TripContextValue> {
  return {
    role: "traveler",
    currentTrip: current,
    followerTrip: current,
    multiTripEnabled: true,
    viewingMode: "follow_current",
    viewingTripId: current.tripId,
    viewingTrip: { tripId: current.tripId, title: current.title },
    serverTripStatus: "known",
  };
}
const viewingSummer = (): Partial<TripContextValue> => ({
  ...following(AUTUMN),
  viewingMode: "private",
  viewingTripId: SUMMER.tripId,
  viewingTrip: SUMMER,
});

const useQueryMock = convexReact.useQuery as unknown as Mock<(query: unknown, args: unknown) => unknown>;
function setupQueries() {
  useQueryMock.mockImplementation((query, args) => {
    if (args === "skip") return undefined;
    if (query === tripcastApi.checkpoints.listCheckpointMapPins) return [];
    if (query === tripcastApi.journalEvents.listJournalEvents) return [];
    if (query === tripcastApi.journalEvents.getJournalUnreadCount) return 0;
    if (query === tripcastApi.liveTrail.travelerGetLiveTrailStatus) return { enabled: false, visibleToFollowers: false };
    if (query === tripcastApi.travelerPreferences.travelerGetPreferences) return { travelerTimeZone: "UTC" };
    if (query === tripcastApi.travelerPreferences.followerGetPreferences) {
      return { visible: true, allowFollowersTripPath: false, liveTrailVisibleToFollowers: false };
    }
    if (query === tripcastApi.travelerState.travelerGetState) return { state: null, visibility: null };
    if (query === tripcastApi.mysteryMissions.listMysteryMissionMapPins) return { rows: [] };
    if (query === tripcastApi.routeVotes.travelerListRouteVotes) return [];
    if (query === tripcastApi.travelFunds.travelerGetConfig) {
      return { enabled: true, featureEnabled: true, startingBudgetUsd: 100, remainingUsd: 75, spentUsd: 25 };
    }
    return null;
  });
}

let tripContext: Partial<TripContextValue> = {};
function Wrapper({ children }: { children: React.ReactNode }) {
  return <TripContextTestProvider value={tripContext}>{children}</TripContextTestProvider>;
}
function renderMap(trip: Partial<TripContextValue>, role: "traveler" | "follower" = "traveler") {
  tripContext = trip;
  const ui = <TripMap token={TOKEN} role={role} finaleReplayActive={false} />;
  const result = rtlRender(ui, { wrapper: Wrapper });
  return {
    ...result,
    view(next: Partial<TripContextValue>) {
      tripContext = next;
      result.rerender(ui);
    },
  };
}

const lastSheet = () =>
  sheet.props.at(-1) as { selectedCoordinate: unknown; onSave: (args: object) => void; prefill?: unknown; tripTarget?: unknown };
/** The Traveler right-clicks the map and taps "Add Pin": the Story form opens. */
async function openStoryForm() {
  await waitFor(() => expect(mapHandlers[0]?.contextmenu).toBeDefined());
  act(() => mapHandlers[0].contextmenu({ preventDefault() {}, lngLat: { lat: 47.6, lng: -122.3 } }));
  await userEvent.click(await screen.findByRole("button", { name: "Add Pin" }));
  await waitFor(() => expect(lastSheet()?.selectedCoordinate).not.toBeNull());
}
function saveStory() {
  act(() => lastSheet().onSave({ title: "Story", source: "right_click", lat: 47.6, lon: -122.3, imageSize: "medium" }));
}
/** The 4th `startSave` argument: the trip the queued save is stamped with. */
const savedTrip = () => bg.startSave.mock.calls.at(-1)?.[3];

function failedSave(patch: Partial<PendingSave>): PendingSave {
  return {
    id: "save-1",
    data: { showInStory: true, lat: 1, lon: 2, imageSize: "medium", source: "manual", title: "Lost", happenedAt: 5, stagedTransactionIds: ["tx-1"] },
    status: "failed",
    error: "offline",
    progress: 0,
    createdAt: 1,
    retryCount: 1,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sheet.props.length = 0;
  mapHandlers.length = 0;
  bg.saves = [];
  bg.notices = [];
  bg.startSave.mockResolvedValue("queued");
  bg.retrySave.mockResolvedValue(undefined);
  bg.dismissSave.mockResolvedValue(undefined);
  MISSION.current = null;
  setupQueries();
});

describe("a queued Story names the trip its form was opened on", () => {
  it("opened in a private view of Summer, saved after Return to current: the save names Summer", async () => {
    const map = renderMap(viewingSummer());
    await openStoryForm();
    map.view(following(AUTUMN));
    // The open form keeps naming Summer (its label) while Autumn is on screen.
    expect(lastSheet().tripTarget).toEqual(SUMMER);
    saveStory();
    expect(savedTrip()).toEqual(SUMMER);
  });

  it("opened while following Autumn, the shared trip switches to Winter on another device: the save names Autumn", async () => {
    const map = renderMap(following(AUTUMN));
    await openStoryForm();
    map.view(following(WINTER));
    saveStory();
    expect(savedTrip()).toEqual({ tripId: AUTUMN.tripId, title: AUTUMN.title });
  });

  it("a form closed and opened again takes the trip on screen at the new open", async () => {
    const map = renderMap(viewingSummer());
    await openStoryForm();
    map.view(following(AUTUMN));
    act(() => (lastSheet() as unknown as { onClose: () => void }).onClose());
    await waitFor(() => expect(lastSheet().selectedCoordinate).toBeNull());
    await openStoryForm();
    saveStory();
    expect(savedTrip()).toEqual({ tripId: AUTUMN.tripId, title: AUTUMN.title });
  });

  it("a mission completed as a Story names the trip its detail was opened on, even if the view moved before the form opened", async () => {
    MISSION.current = { _id: "mission-1", title: "Climb", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1, lat: 47.6, lon: -122.3 };
    const map = renderMap(viewingSummer());
    await screen.findByRole("button", { name: "Complete as story" });
    map.view(following(AUTUMN));
    await userEvent.click(screen.getByRole("button", { name: "Complete as story" }));
    await waitFor(() => expect(lastSheet()?.selectedCoordinate).not.toBeNull());
    saveStory();
    expect(savedTrip()).toEqual(SUMMER);
    expect(lastSheet().prefill).toMatchObject({ missionId: "mission-1", completeMission: true });
  });

  it("multi-trip off: the save is stamped with no trip, exactly as today", async () => {
    renderMap({});
    await openStoryForm();
    saveStory();
    expect(bg.startSave).toHaveBeenCalledTimes(1);
    expect(savedTrip()).toBeNull();
    expect(bg.startSave.mock.calls[0]?.[0]).not.toHaveProperty("tripId");
  });

  it("a Follower has no Story form", async () => {
    renderMap({ role: "follower", viewingTripId: AUTUMN.tripId, viewingTrip: { tripId: AUTUMN.tripId, title: AUTUMN.title } }, "follower");
    await waitFor(() => expect(mapHandlers[0]?.contextmenu).toBeDefined());
    expect(sheet.props).toHaveLength(0);
    expect(bg.startSave).not.toHaveBeenCalled();
  });
});

describe("Retry keeps the queued save", () => {
  const toast = () => within(document.querySelector<HTMLElement>("[data-bg-retry-toast]")!);
  const retry = () => userEvent.click(toast().getByRole("button", { name: /Retry/ }));

  it("a failed save with its trip is re-sent from the queue: nothing dismissed, no empty form", async () => {
    bg.saves = [failedSave({ tripId: SUMMER.tripId, tripTitle: SUMMER.title })];
    renderMap(following(AUTUMN));
    await retry();
    expect(bg.retrySave).toHaveBeenCalledWith("save-1");
    expect(bg.dismissSave).not.toHaveBeenCalled();
    expect(sheet.props.every((props) => props.selectedCoordinate === null)).toBe(true);
  });

  it("an older untagged save with multi-trip on is re-sent from the queue (placed by its own time, not the screen)", async () => {
    bg.saves = [failedSave({})];
    renderMap(viewingSummer());
    await retry();
    expect(bg.retrySave).toHaveBeenCalledWith("save-1");
    expect(bg.dismissSave).not.toHaveBeenCalled();
  });

  it("a save that couldn't be placed is sent only to the trip the Traveler picks by name", async () => {
    bg.saves = [failedSave({ error: "Couldn't tell which trip this save belongs to. Choose where to save it, or dismiss it." })];
    renderMap(viewingSummer());
    expect(toast().queryByRole("button", { name: /Retry/ })).toBeNull();
    await userEvent.click(toast().getByRole("button", { name: "Save to Summer 2026" }));
    expect(bg.retrySave).toHaveBeenCalledWith("save-1", SUMMER);
    expect(bg.dismissSave).not.toHaveBeenCalled();
  });

  it("multi-trip off: as today, the form reopens with the save's content and the queued save is dismissed", async () => {
    bg.saves = [failedSave({})];
    renderMap({});
    await retry();
    expect(bg.retrySave).not.toHaveBeenCalled();
    expect(bg.dismissSave).toHaveBeenCalledWith("save-1");
    await waitFor(() => expect(lastSheet().selectedCoordinate).toMatchObject({ lat: 1, lon: 2 }));
    expect(lastSheet().prefill).toMatchObject({ title: "Lost" });
  });
});
