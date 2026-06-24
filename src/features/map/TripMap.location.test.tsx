import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type JournalEvent, type MysteryMissionFeedItem } from "../../convex/tripcastApi";
import { clearLogs, getLogs, setEnabled } from "../../debug/debugLogger";
import { ThemeProvider, useTheme } from "../../providers/ThemeProvider";
import TripMap from "./TripMap";
import { useTripPath } from "./useTripPath";
import { setFixOverlayEnabled } from "../../lib/fixOverlayToggle";

const mapEaseTo = vi.fn();
const mapFitBounds = vi.fn();
const markerElements: HTMLElement[] = [];
const geolocationWatchPosition = vi.fn();
const geolocationClearWatch = vi.fn();
const geolocationGetCurrentPosition = vi.fn();
const updateTravelerLocation = vi.fn();
const applyMovementDetection = vi.fn();
const stopTravelerLocationSharing = vi.fn();
const setLiveTrailEnabled = vi.fn();
const setLiveTrailVisibility = vi.fn();
const recordLiveTrailSample = vi.fn();
const deleteRecentLiveTrail = vi.fn();
const fetchMock = vi.fn();
const convexMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));
const convexQuery = convexMocks.query;
const nativeLocationMocks = vi.hoisted(() => ({
  isNativeLocationAvailable: vi.fn(() => false),
  openNativeLocationSettings: vi.fn(),
  startNativeLocationWatch: vi.fn(
    (_onFix: (fix: { lat: number; lon: number; accuracy?: number }) => void, _onError: (error: unknown) => void) =>
      vi.fn(),
  ),
}));
let mapStyleLoaded = true;
const mapConstructorOptions: unknown[] = [];
const mapInstances: Array<{
  handlers: Record<string, (event: any) => void>;
  remove: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  dragPan: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  scrollZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  boxZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  dragRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  keyboard: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  doubleClickZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  touchZoomRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  addSource: ReturnType<typeof vi.fn>;
  addLayer: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}> = [];
const routeVotePanelProps: Array<{
  fallbackOrigin: { lat: number; lon: number } | null;
}> = [];
let lastCheckpointSheetProps: any = null;

vi.mock("convex/react", () => ({
  useConvex: vi.fn(() => ({ query: convexMocks.query })),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../providers/BackgroundSaveProvider", () => ({
  useBackgroundSave: () => ({ saves: [], startSave: vi.fn().mockResolvedValue("mock-id"), retrySave: vi.fn(), dismissSave: vi.fn() }),
  BackgroundSaveProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./useTripPath", () => ({
  useTripPath: vi.fn(),
}));

vi.mock("./useLiveTrailPath", () => ({
  useLiveTrailPath: vi.fn(),
}));

vi.mock("./useCloakingZones", () => ({
  useCloakingZones: vi.fn(),
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

vi.mock("../../native/locationWatcher", () => ({
  isNativeLocationAvailable: nativeLocationMocks.isNativeLocationAvailable,
  openNativeLocationSettings: nativeLocationMocks.openNativeLocationSettings,
  startNativeLocationWatch: nativeLocationMocks.startNativeLocationWatch,
}));

vi.mock("maplibre-gl", () => {
  class MockMap {
    handlers: Record<string, (event: any) => void> = {};
    remove = vi.fn();
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    boxZoom = { enable: vi.fn(), disable: vi.fn() };
    dragRotate = { enable: vi.fn(), disable: vi.fn() };
    keyboard = { enable: vi.fn(), disable: vi.fn() };
    doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
    touchZoomRotate = { enable: vi.fn(), disable: vi.fn() };

    constructor(options?: unknown) {
      mapConstructorOptions.push(options);
      mapInstances.push(this);
    }

    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    setStyle = vi.fn(() => this);
    fitBounds = mapFitBounds;
    on = vi.fn((event: string, handler: (event: any) => void) => {
      this.handlers[event] = handler;
      return this;
    });
    off = vi.fn((event: string) => {
      delete this.handlers[event];
      return this;
    });
    once = vi.fn((event: string, handler: (event: any) => void) => {
      this.handlers[event] = handler;
      return this;
    });
    getLayer = vi.fn(() => false);
    removeLayer = vi.fn();
    getSource = vi.fn(() => false);
    removeSource = vi.fn();
    isStyleLoaded = vi.fn(() => mapStyleLoaded);
    getZoom = vi.fn(() => 12);
    project = vi.fn(() => ({ x: 120, y: 160 }));
    queryRenderedFeatures = vi.fn(() => []);
    getContainer = vi.fn(() => ({
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    }));
    easeTo = mapEaseTo;
    jumpTo = vi.fn();
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

  class MockNavigationControl {
    constructor() {}
  }

  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      Popup: MockPopup,
      NavigationControl: MockNavigationControl,
    },
    Marker: MockMarker,
  };
});

vi.mock("./AddCheckpointSheet", () => ({
  default: (props: any) => {
    lastCheckpointSheetProps = props;
    return props.selectedCoordinate ? <div data-testid="checkpoint-sheet" /> : null;
  },
}));

vi.mock("./RouteVoteMapOverlay", () => ({
  default: () => null,
}));

vi.mock("./MissionMarkers", () => ({
  default: () => null,
}));

vi.mock("../routevote/RouteVoteButton", () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Votes
    </button>
  ),
}));

vi.mock("../routevote/RouteVotePanel", () => ({
  default: (props: {
    fallbackOrigin: { lat: number; lon: number } | null;
    onRequestFitMap: (bounds: [[number, number], [number, number]] | null) => void;
  }) => {
    routeVotePanelProps.push({ fallbackOrigin: props.fallbackOrigin });
    return (
      <div data-role="route-votes-sheet" data-testid="route-vote-panel">
        <button
          type="button"
          onClick={() => props.onRequestFitMap([[-122.36, 47.6], [-122.3, 47.64]])}
        >
          Fit vote map
        </button>
      </div>
    );
  },
}));

vi.mock("../journal/JournalSheet", () => ({
  default: () => <div data-testid="journal-sheet" />,
}));

vi.mock("../travelfunds/TravelFundsSheet", () => ({
  default: () => <div data-testid="funds-sheet" />,
}));

function setupQueries({
  checkpoints = [],
  journalEvents = [],
  travelerLocation = null,
  mysteryPins = [],
  mysteryPinsLoading = false,
  allowFollowersTripPath = false,
  travelerPreferences = { travelerTimeZone: "UTC" },
  liveTrailStatus = {
    enabled: false,
    visibleToFollowers: false,
    sampleCount: 0,
    samples: [],
  },
  followerLiveTrail = {
    visible: false,
    samples: [],
  },
}: {
  checkpoints?: Array<{
    _id: string;
    _creationTime: number;
    title: string;
    lat: number;
    lon: number;
    source: "right_click";
    createdAt: number;
    updatedAt: number;
  }>;
  journalEvents?: JournalEvent[];
  travelerLocation?: { lat: number; lon: number; accuracy?: number; isSharing: true } | null;
  mysteryPins?: MysteryMissionFeedItem[];
  mysteryPinsLoading?: boolean;
  allowFollowersTripPath?: boolean;
  travelerPreferences?: {
    travelerTimeZone?: string;
    followerContentCutoffEnabled?: boolean;
    followerContentCutoffAt?: number;
    movementDetectionEnabled?: boolean;
    movementWalkingThresholdMps?: number;
    movementMovingThresholdMps?: number;
  };
  liveTrailStatus?: {
    enabled: boolean;
    visibleToFollowers: boolean;
    sampleCount: number;
    samples: Array<{
      _id: string;
      lat: number;
      lon: number;
      sampledAt: number;
      accuracy?: number;
    }>;
  };
  followerLiveTrail?: {
    visible: boolean;
    samples: Array<{
      _id: string;
      lat: number;
      lon: number;
      sampledAt: number;
    }>;
  };
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((query: unknown) => {
    if (query === tripcastApi.checkpoints.listCheckpoints) return checkpoints;
    if (query === tripcastApi.travelerLocations.getTravelerLocation) {
      return travelerLocation;
    }
    if (query === tripcastApi.liveTrail.travelerGetLiveTrailStatus) {
      return liveTrailStatus;
    }
    if (query === tripcastApi.liveTrail.followerListLiveTrailSamples) {
      return followerLiveTrail;
    }
    if (query === tripcastApi.travelerPreferences.followerGetPreferences) {
      return { visible: true, allowFollowersTripPath };
    }
    if (query === tripcastApi.travelerState.travelerGetState) {
      return { state: null, visibility: null };
    }
    if (query === tripcastApi.travelerAutoState.travelerGetAutoState) return null;
    if (query === tripcastApi.travelerPreferences.travelerGetPreferences) {
      return travelerPreferences;
    }
    if (query === tripcastApi.journalEvents.listJournalEvents) return journalEvents;
    if (query === tripcastApi.mysteryMissions.listMysteryMissionMapPins) {
      if (mysteryPinsLoading) return undefined;
      return { rows: mysteryPins };
    }
    if (query === tripcastApi.routeVotes.travelerListRouteVotes) return [];
    if (query === tripcastApi.travelFunds.travelerGetConfig) {
      return {
        enabled: true,
        featureEnabled: true,
        startingBudgetUsd: 100,
        remainingUsd: 75,
        spentUsd: 25,
        budgetLabel: undefined,
      };
    }
    if (query === tripcastApi.travelFunds.followerGetFundsSummary) {
      return {
        enabled: true,
        featureEnabled: true,
        remainingUsd: 75,
        spentUsd: 25,
        budgetLabel: undefined,
      };
    }
    return null;
  });
}

function getTravelerMarker() {
  return markerElements
    .filter((el) => el.className.includes("traveler-location-marker"))
    .at(-1);
}

function makeJournalEvent(overrides: Partial<JournalEvent> = {}): JournalEvent {
  return {
    _id: "event-1",
    _creationTime: 1,
    type: "story",
    narrativeLevel: "activity",
    occurredAt: Date.UTC(2026, 4, 16, 14, 32),
    createdAt: 1,
    title: "Original check in",
    body: "Original body",
    checkpointId: "checkpoint-1",
    lat: 47.61,
    lon: -122.33,
    ...overrides,
  };
}

function makeMysteryMission(overrides: Partial<MysteryMissionFeedItem> = {}): MysteryMissionFeedItem {
  return {
    kind: "mystery_mission",
    _id: "mystery-1",
    mysteryMissionId: "mystery-1",
    state: "signal",
    lat: 47.65,
    lon: -122.35,
    mysteryText: "Follow the signal",
    spawnRadiusMiles: 0.5,
    priority: 1,
    ...overrides,
  };
}

function ThemeToggleTripMap() {
  const { setMode } = useTheme();
  return (
    <>
      <button type="button" onClick={() => setMode("constellation")}>
        Constellation theme
      </button>
      <TripMap token="test-token" role="traveler" />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  clearLogs();
  markerElements.length = 0;
  mapConstructorOptions.length = 0;
  mapInstances.length = 0;
  routeVotePanelProps.length = 0;
  lastCheckpointSheetProps = null;
  mapStyleLoaded = true;
  mapFitBounds.mockClear();
  updateTravelerLocation.mockResolvedValue(null);
  applyMovementDetection.mockResolvedValue(null);
  stopTravelerLocationSharing.mockResolvedValue(null);
  setLiveTrailEnabled.mockResolvedValue(null);
  setLiveTrailVisibility.mockResolvedValue(null);
  recordLiveTrailSample.mockResolvedValue(null);
  deleteRecentLiveTrail.mockResolvedValue({ deleted: 0 });
  convexQuery.mockResolvedValue({ page: [], isDone: true, continueCursor: "" });
  nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(false);
  nativeLocationMocks.openNativeLocationSettings.mockClear();
  nativeLocationMocks.startNativeLocationWatch.mockReset();
  nativeLocationMocks.startNativeLocationWatch.mockReturnValue(vi.fn());
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  (vi.mocked(convexReact.useMutation) as any).mockImplementation((mutation: unknown) => {
    if (mutation === tripcastApi.travelerLocations.updateTravelerLocation) {
      return updateTravelerLocation;
    }
    if (mutation === tripcastApi.travelerLocations.stopTravelerLocationSharing) {
      return stopTravelerLocationSharing;
    }
    if (mutation === tripcastApi.currentActivity.travelerApplyMovementDetection) {
      return applyMovementDetection;
    }
    if (mutation === tripcastApi.liveTrail.travelerSetLiveTrailEnabled) {
      return setLiveTrailEnabled;
    }
    if (mutation === tripcastApi.liveTrail.travelerSetLiveTrailVisibility) {
      return setLiveTrailVisibility;
    }
    if (mutation === tripcastApi.liveTrail.travelerRecordLiveTrailSample) {
      return recordLiveTrailSample;
    }
    if (mutation === tripcastApi.liveTrail.travelerDeleteRecentLiveTrail) {
      return deleteRecentLiveTrail;
    }
    return vi.fn().mockResolvedValue(null);
  });

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: geolocationWatchPosition,
      clearWatch: geolocationClearWatch,
      getCurrentPosition: geolocationGetCurrentPosition,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TripMap location marker", () => {
  it("lets map drags pass through empty top HUD space", () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    const statusCard = screen.getByRole("button", { name: /Traveler status/i });
    const statusHitbox = statusCard.parentElement;
    const topHud = statusHitbox?.closest(".tripcast-frame");

    expect(topHud).toHaveClass("pointer-events-none");
    expect(statusHitbox).toHaveClass("pointer-events-auto", "w-fit", "self-start");
    expect(screen.getByRole("button", { name: /Start sharing live location/i })).toHaveClass(
      "pointer-events-auto",
    );
    expect(screen.getByRole("button", { name: /Replay/i })).toHaveClass("pointer-events-auto");
  });

  it("refreshes an open story detail when journal query data changes", async () => {
    const checkpoint = {
      _id: "checkpoint-1",
      _creationTime: 1,
      title: "Original check in",
      lat: 47.61,
      lon: -122.33,
      source: "right_click" as const,
      createdAt: 1,
      updatedAt: 1,
    };
    const originalEvent = makeJournalEvent();
    setupQueries({
      checkpoints: [checkpoint],
      journalEvents: [originalEvent],
    });

    const { rerender } = render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(markerElements.find((el) => el.style.cursor === "pointer")).toBeTruthy();
    });
    const checkpointMarker = markerElements.find((el) => el.style.cursor === "pointer");
    fireEvent.click(checkpointMarker!);

    expect(await screen.findByText("Original check in")).toBeInTheDocument();
    expect(screen.getByLabelText("Original body")).toBeInTheDocument();

    setupQueries({
      checkpoints: [{ ...checkpoint, title: "Updated check in", updatedAt: 2 }],
      journalEvents: [
        makeJournalEvent({
          title: "Updated check in",
          body: "Updated body",
        }),
      ],
    });
    rerender(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(screen.getByText("Updated check in")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Updated body")).toBeInTheDocument();
  });

  it("navigates Story detail chronologically and refocuses the map", async () => {
    setEnabled(true);
    const checkpoints = [
      {
        _id: "checkpoint-old",
        _creationTime: 1,
        title: "Old story",
        lat: 47.61,
        lon: -122.31,
        source: "right_click" as const,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: "checkpoint-middle",
        _creationTime: 2,
        title: "Middle story",
        lat: 47.62,
        lon: -122.32,
        source: "right_click" as const,
        createdAt: 2,
        updatedAt: 2,
      },
      {
        _id: "checkpoint-new",
        _creationTime: 3,
        title: "New story",
        lat: 47.63,
        lon: -122.33,
        source: "right_click" as const,
        createdAt: 3,
        updatedAt: 3,
      },
    ];
    setupQueries({
      checkpoints,
      journalEvents: [
        makeJournalEvent({
          _id: "event-new",
          checkpointId: "checkpoint-new",
          title: "New story",
          occurredAt: 3000,
          lat: 47.63,
          lon: -122.33,
        }),
        makeJournalEvent({
          _id: "event-middle",
          checkpointId: "checkpoint-middle",
          title: "Middle story",
          occurredAt: 2000,
          lat: 47.62,
          lon: -122.32,
        }),
        makeJournalEvent({
          _id: "event-old",
          checkpointId: "checkpoint-old",
          title: "Old story",
          occurredAt: 1000,
          lat: 47.61,
          lon: -122.31,
        }),
      ],
    });

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(markerElements.filter((el) => el.style.cursor === "pointer")).toHaveLength(3);
    });
    fireEvent.click(markerElements.filter((el) => el.style.cursor === "pointer")[1]);

    expect(await screen.findByText("Middle story")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous story" })).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("button", { name: "Next story" })).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(screen.getByRole("button", { name: "Next story" }));

    await waitFor(() => {
      expect(screen.getByText("New story")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mapEaseTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ center: [-122.33, 47.63] }),
      );
    });
    expect(screen.getByRole("button", { name: "Next story" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next story" }));

    await waitFor(() => {
      expect(getLogs().some((entry) => entry.action === "story:navigate:index-shift")).toBe(true);
      expect(getLogs().some((entry) => entry.action === "story:navigate:boundary")).toBe(true);
    });
  });

  it("runs Trip Replay with playhead clipping, shuttle logging, and Close", async () => {
    setEnabled(true);
    setupQueries({
      checkpoints: [
        {
          _id: "checkpoint-old",
          _creationTime: 1,
          title: "Old story",
          lat: 47.61,
          lon: -122.31,
          source: "right_click",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "checkpoint-new",
          _creationTime: 2,
          title: "New story",
          lat: 47.63,
          lon: -122.33,
          source: "right_click",
          createdAt: 3000,
          updatedAt: 3000,
        },
      ],
      journalEvents: [
        makeJournalEvent({
          _id: "event-new",
          checkpointId: "checkpoint-new",
          title: "New story",
          occurredAt: 3000,
          lat: 47.63,
          lon: -122.33,
        }),
        makeJournalEvent({
          _id: "event-old",
          checkpointId: "checkpoint-old",
          title: "Old story",
          occurredAt: 1000,
          lat: 47.61,
          lon: -122.31,
        }),
      ],
    });

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    const replayHud = await screen.findByRole("group", { name: "Trip Replay" });
    expect(replayHud).toBeInTheDocument();
    expect(replayHud).toHaveClass("bottom-[88px]");
    await waitFor(() => {
      // No more look-ahead: trail reveals point-by-point (1000) as the replay
      // progresses, so the focus marker and the path end stay in sync.
      expect(vi.mocked(useTripPath).mock.calls.some((call) => call[4] === 1000)).toBe(true);
      expect(mapEaseTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ center: [-122.31, 47.61] }),
      );
    });

    // Speed now lives in a dedicated bottom sheet opened from the HUD pill.
    fireEvent.click(screen.getByRole("button", { name: /change replay speed/i }));
    const speedOption = await screen.findByRole("button", { name: "10x" });
    fireEvent.click(speedOption);

    await waitFor(() => {
      expect(getLogs().some((entry) => entry.action === "replay:speed-sheet:open")).toBe(true);
      expect(getLogs().some((entry) => entry.action === "replay:speed-shift")).toBe(true);
      expect(getLogs().some((entry) => entry.action === "replay:coordinate-snap")).toBe(true);
    });

    const callsBeforeClose = mapEaseTo.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /close trip replay/i }));

    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "Trip Replay" })).not.toBeInTheDocument();
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true,
        null,
        "#444444",
        [],
        false,
      );
      expect(mapEaseTo).toHaveBeenCalledTimes(callsBeforeClose);
      expect(getLogs().some((entry) => entry.action === "replay:close")).toBe(true);
    });
  });

  it("excludes pre-cutoff pins from Traveler replay so it matches the Follower content cutoff", async () => {
    setEnabled(true);
    setupQueries({
      travelerPreferences: {
        travelerTimeZone: "UTC",
        followerContentCutoffEnabled: true,
        followerContentCutoffAt: 2000,
      },
      journalEvents: [
        makeJournalEvent({
          _id: "event-old",
          checkpointId: "checkpoint-old",
          title: "Hidden story",
          occurredAt: 1000, // before the cutoff — must not be replayed
          lat: 47.5,
          lon: -122.5,
        }),
        makeJournalEvent({
          _id: "event-mid",
          checkpointId: "checkpoint-mid",
          title: "First visible story",
          occurredAt: 3000,
          lat: 47.6,
          lon: -122.6,
        }),
        makeJournalEvent({
          _id: "event-new",
          checkpointId: "checkpoint-new",
          title: "Second visible story",
          occurredAt: 4000,
          lat: 47.7,
          lon: -122.7,
        }),
      ],
    });

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    // The replay trail fetch carries the Traveler's cutoff so the server filters
    // breadcrumbs the same way the map does.
    await waitFor(() => {
      expect(convexQuery).toHaveBeenCalledWith(
        tripcastApi.liveTrail.listReplayLiveTrailSamples,
        expect.objectContaining({ token: "test-token", cutoffAt: 2000 }),
      );
    });

    // Replay starts at the first visible pin, never the cutoff-hidden one.
    await waitFor(() => {
      expect(mapEaseTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [-122.6, 47.6] }),
      );
    });
    expect(mapEaseTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ center: [-122.5, 47.5] }),
    );
  });

  it("keeps Funds off the Dock but closes its sheet when another Dock sheet opens", async () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    expect(screen.queryByRole("button", { name: "Funds" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Funds\./ }));
    expect(await screen.findByTestId("funds-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Journal" }));

    await waitFor(() => {
      expect(screen.queryByTestId("funds-sheet")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("journal-sheet")).toBeInTheDocument();
  });

  it("anchors map HUD controls away from MapLibre's stack", () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    expect(screen.getByRole("button", { name: "Center map on traveler" })).toHaveClass("bottom-[118px]");
    expect(screen.getByRole("navigation", { name: "Map sections" }).parentElement).toHaveClass(
      "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]",
    );
  });

  it("nests the mute pin in the cardsWrapper row alongside the Replay pill", () => {
    // Regression guard. The mute pin used to be an absolute overlay anchored to the viewport's
    // top-right corner, which collided with whatever sat there at narrow widths. The fix nests it
    // as a sibling of the Replay pill so the cardsWrapper's layout positions both at every width.
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    const muteBtn = screen.getByRole("button", { name: /mute soundtrack/i });
    const replayBtn = screen.getByRole("button", { name: "Replay" });
    expect(muteBtn.parentElement).toBe(replayBtn.parentElement);
    expect(muteBtn.closest(".tripcast-frame")).not.toBeNull();
    expect(muteBtn.closest(".tripcast-frame")).toBe(replayBtn.closest(".tripcast-frame"));
  });

  it("uses the same top HUD row structure for Followers", () => {
    setupQueries();

    render(<TripMap token="test-token" role="follower" />);

    expect(screen.getByRole("group", { name: "Traveler status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replay" }).closest(".grid")).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
  });

  it("closes Traveler State when a Dock sheet opens", async () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: /Traveler status/ }));
    expect(await screen.findByRole("heading", { name: "Update Status" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Journal" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Update Status" })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("journal-sheet")).toBeInTheDocument();
  });

  it("removes the follower add button and keeps Awards in the Dock", () => {
    setupQueries();

    render(<TripMap token="test-token" role="follower" />);

    expect(screen.getByRole("button", { name: "Journal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Missions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Awards" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("keeps the route vote fallback origin stable across follower rerenders", async () => {
    setupQueries({
      checkpoints: [
        {
          _id: "checkpoint-1",
          _creationTime: 1,
          title: "Last stop",
          lat: 47.61,
          lon: -122.33,
          source: "right_click",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const { rerender } = render(<TripMap token="test-token" role="follower" />);

    fireEvent.click(screen.getByRole("button", { name: "Votes" }));

    await waitFor(() => {
      expect(routeVotePanelProps.length).toBeGreaterThan(0);
    });
    const firstFallbackOrigin = routeVotePanelProps.at(-1)?.fallbackOrigin;

    rerender(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(routeVotePanelProps.at(-1)?.fallbackOrigin).toBe(firstFallbackOrigin);
    });
  });

  it("pulses the follower marker when traveler location is actively shared", async () => {
    setupQueries({
      travelerLocation: { lat: 47.61, lon: -122.33, isSharing: true },
    });

    render(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(getTravelerMarker()).toHaveClass("traveler-location-marker--pulsing");
    });
  });

  it("waits for the map style before adding the traveler accuracy circle", async () => {
    mapStyleLoaded = false;
    setupQueries({
      travelerLocation: { lat: 47.61, lon: -122.33, accuracy: 12, isSharing: true },
    });

    render(<TripMap token="test-token" role="follower" />);

    const map = mapInstances.at(-1);
    await waitFor(() => {
      expect(map?.on).toHaveBeenCalledWith("style.load", expect.any(Function));
    });

    expect(map?.addSource).not.toHaveBeenCalled();
    expect(map?.addLayer).not.toHaveBeenCalled();

    mapStyleLoaded = true;
    act(() => {
      map?.handlers["style.load"]?.({});
    });

    expect(map?.addSource).toHaveBeenCalledWith(
      "accuracy-circle",
      expect.objectContaining({ type: "geojson" }),
    );
    expect(map?.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "accuracy-circle-fill" }),
    );
    expect(map?.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "accuracy-circle-stroke" }),
    );
  });

  it("starts browser location watching immediately for Travelers", async () => {
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(geolocationWatchPosition).toHaveBeenCalled();
    });

    // The marker might be added asynchronously via state update after geolocation fix
    await waitFor(() => {
      expect(getTravelerMarker()).toBeDefined();
    });
    // Dot is present but NOT pulsing yet because Live is off by default
    expect(getTravelerMarker()).not.toHaveClass("traveler-location-marker--pulsing");

    fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

    await waitFor(() => {
      expect(getTravelerMarker()).toHaveClass("traveler-location-marker--pulsing");
    });
    expect(updateTravelerLocation).toHaveBeenCalledWith({
      token: "test-token",
      lat: 47.62,
      lon: -122.34,
      accuracy: 9,
    });
  });

  it("opens native settings on Live opt-in after a passive foreground GPS denial", async () => {
    nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(true);
    geolocationWatchPosition.mockImplementation((_onSuccess, onError) => {
      onError({ code: 1 });
      return 42;
    });
    nativeLocationMocks.startNativeLocationWatch.mockImplementation((_onFix, onError) => {
      onError({ code: "NOT_AUTHORIZED" });
      return vi.fn();
    });
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(geolocationWatchPosition).toHaveBeenCalled();
      expect(screen.getByText("Location access is off for TripCast. You can enable it in your device settings."))
        .toBeInTheDocument();
    });
    expect(nativeLocationMocks.openNativeLocationSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

    await waitFor(() => {
      expect(nativeLocationMocks.startNativeLocationWatch).toHaveBeenCalled();
      expect(nativeLocationMocks.openNativeLocationSettings).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps follow mode active through programmatic zoom and stops it on user zoom", async () => {
    setupQueries({
      travelerLocation: { lat: 47.61, lon: -122.33, isSharing: true },
    });

    render(<TripMap token="test-token" role="follower" />);

    const centerButton = screen.getByRole("button", { name: "Center map on traveler" });
    expect(centerButton).not.toHaveClass("text-[var(--flag)]");

    fireEvent.click(centerButton);

    await waitFor(() => {
      expect(centerButton).toHaveClass("text-[var(--flag)]");
      expect(mapEaseTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ center: [-122.33, 47.61] }),
      );
    });

    act(() => {
      mapInstances.at(-1)?.handlers.zoomstart?.({});
    });

    expect(centerButton).toHaveClass("text-[var(--flag)]");

    act(() => {
      mapInstances.at(-1)?.handlers.zoomstart?.({ originalEvent: new WheelEvent("wheel") });
    });

    await waitFor(() => {
      expect(centerButton).not.toHaveClass("text-[var(--flag)]");
    });
  });

  it("lets sheet camera fit turn off GPS follow", async () => {
    setupQueries({
      travelerLocation: { lat: 47.61, lon: -122.33, isSharing: true },
    });

    render(<TripMap token="test-token" role="follower" />);

    const centerButton = screen.getByRole("button", { name: "Center map on traveler" });
    fireEvent.click(centerButton);

    await waitFor(() => {
      expect(centerButton).toHaveClass("text-[var(--flag)]");
    });

    fireEvent.click(screen.getByRole("button", { name: "Votes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fit vote map" }));

    await waitFor(() => {
      expect(centerButton).not.toHaveClass("text-[var(--flag)]");
      expect(mapFitBounds).toHaveBeenLastCalledWith(
        [[-122.36, 47.6], [-122.3, 47.64]],
        expect.objectContaining({ maxZoom: 14 }),
      );
    });
  });

  describe("Mystery Mission signal reveal", () => {
    it("does not center on signals from the first loaded mystery snapshot", async () => {
      const travelerLocation = { lat: 47.61, lon: -122.33, isSharing: true } as const;
      setupQueries({
        travelerLocation,
        mysteryPinsLoading: true,
      });

      const { rerender } = render(<TripMap token="test-token" role="follower" />);

      const centerButton = screen.getByRole("button", { name: "Center map on traveler" });
      fireEvent.click(centerButton);

      await waitFor(() => {
        expect(centerButton).toHaveClass("text-[var(--flag)]");
        expect(mapEaseTo).toHaveBeenLastCalledWith(
          expect.objectContaining({ center: [-122.33, 47.61] }),
        );
      });

      setupQueries({
        travelerLocation,
        mysteryPins: [
          makeMysteryMission({
            _id: "mystery-signal-1",
            mysteryMissionId: "mystery-signal-1",
            lat: 47.655,
            lon: -122.362,
          }),
        ],
      });
      rerender(<TripMap token="test-token" role="follower" />);

      await waitFor(() => {
        expect(markerElements.some((element) => element.classList.contains("mystery-pin--signal"))).toBe(true);
      });
      expect(centerButton).toHaveClass("text-[var(--flag)]");
      expect(mapEaseTo).not.toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-122.362, 47.655],
        }),
      );
      expect(mapEaseTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ center: [-122.33, 47.61] }),
      );
    });

    it("centers on a newly appeared signal and stops follow mode", async () => {
      const travelerLocation = { lat: 47.61, lon: -122.33, isSharing: true } as const;
      const hiddenMystery = makeMysteryMission({
        _id: "mystery-signal-1",
        mysteryMissionId: "mystery-signal-1",
        state: "dismissed",
        lat: 47.655,
        lon: -122.362,
      });
      setupQueries({
        travelerLocation,
        mysteryPins: [hiddenMystery],
      });

      const { rerender } = render(<TripMap token="test-token" role="follower" />);

      await waitFor(() => {
        expect(markerElements.some((element) => element.classList.contains("mystery-pin"))).toBe(true);
      });

      const centerButton = screen.getByRole("button", { name: "Center map on traveler" });
      fireEvent.click(centerButton);

      await waitFor(() => {
        expect(centerButton).toHaveClass("text-[var(--flag)]");
      });

      setupQueries({
        travelerLocation,
        mysteryPins: [
          {
            ...hiddenMystery,
            state: "signal",
          },
        ],
      });
      rerender(<TripMap token="test-token" role="follower" />);

      await waitFor(() => {
        expect(centerButton).not.toHaveClass("text-[var(--flag)]");
        expect(mapEaseTo).toHaveBeenLastCalledWith(
          expect.objectContaining({
            center: [-122.362, 47.655],
            zoom: 14,
          }),
        );
      });
    });

    it("does not center on debug-only dormant pins", async () => {
      const travelerLocation = { lat: 47.61, lon: -122.33, isSharing: true } as const;
      setupQueries({
        travelerLocation,
        mysteryPins: [],
      });

      const { rerender } = render(<TripMap token="test-token" role="traveler" />);

      const centerButton = screen.getByRole("button", { name: "Center map on traveler" });
      fireEvent.click(centerButton);

      await waitFor(() => {
        expect(centerButton).toHaveClass("text-[var(--flag)]");
      });

      setupQueries({
        travelerLocation,
        mysteryPins: [
          makeMysteryMission({
            _id: "mystery-debug-1",
            mysteryMissionId: "mystery-debug-1",
            lat: 47.655,
            lon: -122.362,
            debugOnly: true,
          }),
        ],
      });
      rerender(<TripMap token="test-token" role="traveler" />);

      await waitFor(() => {
        expect(markerElements.some((element) => element.classList.contains("mystery-pin--debug-only"))).toBe(true);
      });
      expect(centerButton).toHaveClass("text-[var(--flag)]");
      expect(mapEaseTo).not.toHaveBeenCalledWith(
        expect.objectContaining({
          center: [-122.362, 47.655],
        }),
      );
    });
  });


  it("throttles repeated traveler location publishes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let onGeolocationSuccess: ((position: GeolocationPosition) => void) = () => {};
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onGeolocationSuccess = onSuccess;
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

    expect(updateTravelerLocation).toHaveBeenCalledTimes(1);

    onGeolocationSuccess?.({
      coords: {
        latitude: 47.63,
        longitude: -122.35,
        accuracy: 8,
      },
    } as GeolocationPosition);
    expect(updateTravelerLocation).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    onGeolocationSuccess?.({
      coords: {
        latitude: 47.63,
        longitude: -122.35,
        accuracy: 8,
      },
    } as GeolocationPosition);
    expect(updateTravelerLocation).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not initialize MapLibre while map cooldown is active", () => {
    sessionStorage.setItem("tripcast.map_cooldown", String(Date.now() + 15 * 60 * 1000));
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    expect(mapConstructorOptions).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Map Service Unavailable");
  });

  it("switches map styles on theme change without recreating MapLibre", async () => {
    setEnabled(true);
    localStorage.setItem("tripcast.theme_mode", "meadow");
    setupQueries();

    render(
      <ThemeProvider>
        <ThemeToggleTripMap />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(mapInstances).toHaveLength(1);
    });
    const map = mapInstances[0];

    fireEvent.click(screen.getByRole("button", { name: "Constellation theme" }));

    await waitFor(() => {
      expect(map.setStyle).toHaveBeenCalledWith(expect.stringContaining("styles/fiord"));
    });
    expect(mapConstructorOptions).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(getLogs().some((entry) => entry.action === "map:style-switch:start")).toBe(true);
    expect(getLogs().some((entry) => entry.action === "map:style-switch:success")).toBe(true);
  });

  it("logs failed map style switches without showing the full-screen map fallback", async () => {
    setEnabled(true);
    localStorage.setItem("tripcast.theme_mode", "meadow");
    setupQueries();

    render(
      <ThemeProvider>
        <ThemeToggleTripMap />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(mapInstances).toHaveLength(1);
    });
    const map = mapInstances[0];
    map.setStyle.mockImplementationOnce(() => {
      throw new Error("style failed");
    });

    fireEvent.click(screen.getByRole("button", { name: "Constellation theme" }));

    await waitFor(() => {
      expect(getLogs().some((entry) => entry.action === "map:style-switch:error")).toBe(true);
    });
    expect(mapConstructorOptions).toHaveLength(1);
    expect(map.remove).not.toHaveBeenCalled();
    expect(screen.queryByText("The map could not load.")).not.toBeInTheDocument();
  });

  it("trips the circuit breaker on 403 or 429 map errors", async () => {
    localStorage.setItem("tripcast.debug.enabled", "true");
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);
    const map = mapInstances[0];

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
          message: "Too many requests",
        },
      });
    });

    await waitFor(() => {
      expect(sessionStorage.getItem("tripcast.map_cooldown")).not.toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent("Map Service Unavailable");
    });
    await waitFor(() => {
      expect(map.dragPan.disable).toHaveBeenCalled();
      expect(map.scrollZoom.disable).toHaveBeenCalled();
      expect(map.doubleClickZoom.disable).toHaveBeenCalled();
    });
    expect(map.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:triggered");
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:degraded-mode:enter");
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:resource-failure:sample");
  });

  it("lets travelers place a pin on the visible cached map during cooldown", async () => {
    setupQueries();
    render(<TripMap token="test-token" role="traveler" />);
    const map = mapInstances[0];

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
        },
      });
    });

    await waitFor(() => {
      expect(map.dragPan.disable).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /check in/i }));

    act(() => {
      map.handlers.click?.({
        point: { x: 10, y: 20 },
        lngLat: { lat: 47.62, lng: -122.34 },
        originalEvent: {},
      });
    });

    expect(await screen.findByTestId("checkpoint-sheet")).toBeInTheDocument();
  });

  it("automatically fills out the story form with current GPS location if available", async () => {
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    // Wait for GPS fix
    await waitFor(() => {
      expect(getTravelerMarker()).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /check in/i }));

    // Should immediately show the sheet without needing a map click
    expect(await screen.findByTestId("checkpoint-sheet")).toBeInTheDocument();

    // Verify map centered on the location
    // Note: focusCoordinate uses querySelector("[data-role='add-checkpoint-sheet']")
    // and falls back to measuring the band if it's missing or hasn't updated its visibility.
    // In this test, we need to provide a mock element for the sheet since the mock component
    // won't be easily measurable by focusCoordinate's logic.
    const mockSheet = document.createElement("div");
    mockSheet.setAttribute("data-role", "add-checkpoint-sheet");
    // Mock getBoundingClientRect for the sheet so focusCoordinate can measure it
    mockSheet.getBoundingClientRect = () => ({
      top: 500,
      left: 0,
      width: 800,
      height: 300,
      bottom: 800,
      right: 800,
      x: 0,
      y: 500,
      toJSON: () => {},
    });
    document.body.appendChild(mockSheet);

    try {
      await waitFor(() => {
        expect(mapEaseTo).toHaveBeenCalledWith(
          expect.objectContaining({ center: [-122.34, 47.62] }),
        );
      });
    } finally {
      document.body.removeChild(mockSheet);
    }
  });

  it("does not show a map retry button to followers", async () => {
    setupQueries();
    render(<TripMap token="test-token" role="follower" />);
    const map = mapInstances[0];

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Map Service Unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("resets map cooldown strikes after a successful traveler retry", async () => {
    localStorage.setItem("tripcast.debug.enabled", "true");
    setupQueries();
    render(<TripMap token="test-token" role="traveler" />);
    const map = mapInstances[0];

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByText("Map Service Unavailable")).not.toBeInTheDocument();
      expect(sessionStorage.getItem("tripcast.map_cooldown")).toBeNull();
    });
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:retry-start");
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:retry-success");

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
        },
      });
    });

    await waitFor(() => {
      const cooldown = JSON.parse(sessionStorage.getItem("tripcast.map_cooldown") ?? "{}");
      expect(cooldown.strikes).toBe(1);
      expect(cooldown.backoffMs).toBe(60_000);
    });
  });

  it("keeps map cooldown protective after a failed traveler retry", async () => {
    localStorage.setItem("tripcast.debug.enabled", "true");
    fetchMock.mockResolvedValue(new Response("still down", { status: 503 }));
    setupQueries();
    render(<TripMap token="test-token" role="traveler" />);
    const map = mapInstances[0];

    act(() => {
      map.handlers.error?.({
        error: {
          status: 429,
          url: "https://tripcast-site.example.test/map/tile/planet/20260520_001001_pt/9/276/167.pbf",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      const cooldown = JSON.parse(sessionStorage.getItem("tripcast.map_cooldown") ?? "{}");
      expect(cooldown.strikes).toBe(2);
      expect(cooldown.backoffMs).toBe(5 * 60_000);
      expect(screen.getByText("Map Service Unavailable")).toBeInTheDocument();
    });
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:retry-start");
    expect(localStorage.getItem("tripcast.debug.logs")).toContain("map:cooldown:retry-failed");
  });

  it("stops location sharing on page hide when the traveler is sharing", async () => {
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      expect(stopTravelerLocationSharing).toHaveBeenCalledWith({
        token: "test-token",
      });
    });
  });

  it("keeps Live Trail settings out of the map HUD while indicating enabled state on Live GPS", () => {
    setupQueries({
      travelerPreferences: {
        travelerTimeZone: "UTC",
        followerContentCutoffEnabled: true,
        followerContentCutoffAt: 60_000,
      },
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 2,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.33, sampledAt: 1 },
          { _id: "sample-2", lat: 47.62, lon: -122.34, sampledAt: 2 },
        ],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    expect(screen.getByRole("button", { name: /Live Trail is enabled/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Live Trail/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete recent Live Trail trace/i })).not.toBeInTheDocument();
    expect(setLiveTrailEnabled).not.toHaveBeenCalled();
    expect(setLiveTrailVisibility).not.toHaveBeenCalled();
    expect(deleteRecentLiveTrail).not.toHaveBeenCalled();
  });

  it("does not emit Live Trail breadcrumbs while Live GPS is off", async () => {
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    // Geolocation IS called now for always-on GPS
    await waitFor(() => {
      expect(geolocationWatchPosition).toHaveBeenCalled();
    });
    // But no breadcrumbs should be recorded
    expect(recordLiveTrailSample).not.toHaveBeenCalled();
  });

  it("keeps Live GPS publishes separate from Live Trail when breadcrumbs are disabled", async () => {
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries({
      liveTrailStatus: {
        enabled: false,
        visibleToFollowers: false,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: "Start sharing live location" }));

    await waitFor(() => {
      expect(updateTravelerLocation).toHaveBeenCalledWith({
        token: "test-token",
        lat: 47.62,
        lon: -122.34,
        accuracy: 9,
      });
    });
    expect(recordLiveTrailSample).not.toHaveBeenCalled();
  });

  it("logs Live Trail permission without precise raw location payloads", async () => {
    setEnabled(true);
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.621234,
          longitude: -122.345678,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: false,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location.*Live Trail is enabled/i }));

    await waitFor(() => {
      expect(recordLiveTrailSample).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "test-token",
          lat: 47.621234,
          lon: -122.345678,
        }),
      );
    });

    const actions = getLogs().map((entry) => entry.action);
    expect(actions).toContain("live-trail:permission:request");
    expect(actions).toContain("live-trail:permission:result");
    const serializedLogs = JSON.stringify(getLogs());
    expect(serializedLogs).not.toContain("47.621234");
    expect(serializedLogs).not.toContain("-122.345678");
    expect(serializedLogs).not.toContain("accuracy");
  });

  it("records Live Trail samples based on distance, time, and relevant turns", async () => {
    let nowMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    let onGeolocationSuccess: ((position: GeolocationPosition) => void) = () => {};
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onGeolocationSuccess = onSuccess;
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: false,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location.*Live Trail is enabled/i }));

    await waitFor(() => {
      expect(recordLiveTrailSample).toHaveBeenCalledTimes(1);
    });

    // 1. Distance-based (50m)
    // 0.0005 deg lat is ~55m
    nowMs += 10_000;
    act(() => {
      onGeolocationSuccess({
        coords: { latitude: 47.6205, longitude: -122.34, accuracy: 8 },
      } as GeolocationPosition);
    });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(2);

    // 2. Time-based (2 minutes / 120s)
    nowMs += 121_000;
    act(() => {
      onGeolocationSuccess({
        coords: { latitude: 47.6205, longitude: -122.34, accuracy: 8 },
      } as GeolocationPosition);
    });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(3);

    // 3. Turn-based (22.5 deg)
    // First, move in a straight line to establish bearing (North: 0 deg)
    nowMs += 10_000;
    act(() => {
      onGeolocationSuccess({
        coords: { latitude: 47.6210, longitude: -122.34, accuracy: 8 },
      } as GeolocationPosition);
    });
    // This was only 55m since last emission (47.6205 -> 47.6210), so it emits via distance.
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(4);

    // Now turn slightly (less than 22.5) - East-ish
    // Moving 15m East (0.0002 deg lon) from 47.6210, -122.34
    nowMs += 10_000;
    act(() => {
      onGeolocationSuccess({
        coords: { latitude: 47.6210, longitude: -122.3401, accuracy: 8 },
      } as GeolocationPosition);
    });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(4); // No emission yet

    // Now turn sharply (more than 22.5)
    // Move more East
    nowMs += 10_000;
    act(() => {
      onGeolocationSuccess({
        coords: { latitude: 47.6210, longitude: -122.3403, accuracy: 8 },
      } as GeolocationPosition);
    });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(5); // Emission via turn!

    dateNow.mockRestore();
  });

  it("forces an immediate breadcrumb emission when Live GPS is toggled ON", async () => {
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({
        coords: {
          latitude: 47.62,
          longitude: -122.34,
          accuracy: 9,
        },
      });
      return 42;
    });
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    // Toggle ON
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));

    await waitFor(() => {
      expect(recordLiveTrailSample).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "test-token",
          lat: 47.62,
          lon: -122.34,
        }),
      );
    });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(1);

    // Toggle OFF — symmetric to start, this emits a final closing breadcrumb
    // at the current position so the trail tail reflects where sharing stopped.
    fireEvent.click(screen.getByRole("button", { name: /Stop sharing live location/i }));
    expect(stopTravelerLocationSharing).toHaveBeenCalled();
    await waitFor(() => {
      expect(recordLiveTrailSample).toHaveBeenCalledTimes(2);
    });

    // Toggle ON again - should emit again immediately
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));

    await waitFor(() => {
      expect(recordLiveTrailSample).toHaveBeenCalledTimes(3);
    });
  });

  it("renders follower Live Trail breadcrumbs only when visible", async () => {
    setupQueries({
      followerLiveTrail: {
        visible: false,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.33, sampledAt: 1 },
          { _id: "sample-2", lat: 47.62, lon: -122.34, sampledAt: 2 },
        ],
      },
    });

    const { rerender } = render(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        [],
        null,
        false,
        null,
        "#444444",
        [],
        false,
      );
    });

    setupQueries({
      followerLiveTrail: {
        visible: true,
        samples: [
          { _id: "sample-1", lat: 47.61, lon: -122.33, sampledAt: 1 },
          { _id: "sample-2", lat: 47.62, lon: -122.34, sampledAt: 2 },
        ],
      },
    });
    rerender(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        [],
        null,
        false,
        null,
        "#444444",
        [
          { _id: "sample-1", lat: 47.61, lon: -122.33, sampledAt: 1 },
          { _id: "sample-2", lat: 47.62, lon: -122.34, sampledAt: 2 },
        ],
        true,
      );
    });
  });

  it("shows the trip path for traveler based on local storage", async () => {
    localStorage.setItem("tripcast.showTripPath", "true");
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true,
        null,
        "#444444",
        [],
        false,
      );
    });

    localStorage.setItem("tripcast.showTripPath", "false");
    // Dispatch event to trigger update in TripMap
    window.dispatchEvent(new Event("tripcast.preferencesUpdated"));

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        false,
        null,
        "#444444",
        [],
        false,
      );
    });
  });

  it("shows the follower trip path only when the traveler allows it AND the follower's toggle is on", async () => {
    localStorage.setItem("tripcast.showTripPath", "true");
    setupQueries({ allowFollowersTripPath: true });

    render(<TripMap token="test-token" role="follower" />);

    // Traveler allows + follower toggle on → visible.
    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true,
        null,
        "#444444",
        [],
        false,
      );
    });

    // Follower turns their own toggle off → hidden, even though the traveler allows it.
    localStorage.setItem("tripcast.showTripPath", "false");
    window.dispatchEvent(new Event("tripcast.preferencesUpdated"));

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        false,
        null,
        "#444444",
        [],
        false,
      );
    });
  });

  it("hides the follower trip path when the traveler disallows it, regardless of the follower toggle", async () => {
    localStorage.setItem("tripcast.showTripPath", "true");
    setupQueries({ allowFollowersTripPath: false });

    render(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        false,
        null,
        "#444444",
        [],
        false,
      );
    });
  });

  it("includes a single breadcrumb in the unified path (liveTrailSamples.length >= 1)", async () => {
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 1,
        samples: [{ _id: "bc-1", lat: 47.615, lon: -122.335, sampledAt: 500 }],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        expect.anything(),
        null,
        "#444444",
        [{ _id: "bc-1", lat: 47.615, lon: -122.335, sampledAt: 500 }],
        true,
      );
    });
  });

  it("keeps recent breadcrumbs on normal map load and switches to replay snapshot after Replay starts", async () => {
    localStorage.setItem("tripcast.showTripPath", "true");
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 1,
        samples: [{ _id: "recent-1", lat: 47.615, lon: -122.335, sampledAt: 500 }],
      },
    });
    const replaySamples = [
      { _id: "older-1", lat: 47.601, lon: -122.301, sampledAt: 100 },
      { _id: "older-2", lat: 47.602, lon: -122.302, sampledAt: 60_100 },
      { _id: "recent-1", lat: 47.615, lon: -122.335, sampledAt: 120_100 },
    ];
    convexQuery.mockResolvedValueOnce({
      page: replaySamples,
      isDone: true,
      continueCursor: "",
    });

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true,
        null,
        "#444444",
        [{ _id: "recent-1", lat: 47.615, lon: -122.335, sampledAt: 500 }],
        true,
      );
    });
    expect(convexQuery).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Replay/i }));

    await waitFor(() => {
      expect(convexQuery).toHaveBeenCalledWith(
        tripcastApi.liveTrail.listReplayLiveTrailSamples,
        expect.objectContaining({
          token: "test-token",
          cutoffAt: undefined,
          paginationOpts: expect.objectContaining({ cursor: null, numItems: 500 }),
        }),
      );
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true,
        expect.any(Number),
        "#444444",
        replaySamples,
        true,
      );
    });
  });

  it("turns a breadcrumb into a story during paused replay", async () => {
    setEnabled(true);
    const breadcrumbs = [
      { _id: "bc-1", lat: 47.61, lon: -122.31, sampledAt: 1000 },
      { _id: "bc-2", lat: 47.62, lon: -122.32, sampledAt: 10000 },
    ];
    convexQuery.mockResolvedValueOnce({
      page: breadcrumbs,
      isDone: true,
      continueCursor: "",
    });
    setupQueries({
      journalEvents: [], // No stories, only breadcrumbs
    });

    render(<TripMap token="test-token" role="traveler" />);

    // Start Replay
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));

    // Replay HUD should appear
    const replayHud = await screen.findByRole("group", { name: "Trip Replay" });
    expect(replayHud).toBeInTheDocument();

    // Pause replay to show Check In button
    const pauseBtn = screen.getByRole("button", { name: /pause replay/i });
    fireEvent.click(pauseBtn);

    // Verify Check In button appears near the breadcrumb
    const checkInBtn = await screen.findByRole("button", { name: "Check In" });
    expect(checkInBtn).toBeInTheDocument();

    // Fine-tune with "Next pin" button
    const nextBtn = screen.getByRole("button", { name: "Next pin" });
    fireEvent.click(nextBtn);

    // Click Check In
    fireEvent.click(checkInBtn);

    // Checkpoint sheet should open (mocked to data-testid="checkpoint-sheet")
    expect(await screen.findByTestId("checkpoint-sheet")).toBeInTheDocument();

    expect(lastCheckpointSheetProps.selectedCoordinate).toMatchObject({
      lat: 47.62,
      lon: -122.32,
      source: "replay_breadcrumb",
    });

    expect(lastCheckpointSheetProps.prefill).toMatchObject({
      happenedAt: 10000,
    });
  });

  it("hides Check In while replay is playing", async () => {
    setEnabled(true);
    const breadcrumbs = [
      { _id: "bc-1", lat: 47.61, lon: -122.31, sampledAt: 1000 },
      { _id: "bc-2", lat: 47.62, lon: -122.32, sampledAt: 10000 },
    ];
    convexQuery.mockResolvedValueOnce({
      page: breadcrumbs,
      isDone: true,
      continueCursor: "",
    });
    setupQueries({ journalEvents: [] });

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    await screen.findByRole("group", { name: "Trip Replay" });

    // Replay starts playing — Check In should NOT be visible.
    expect(screen.queryByRole("button", { name: "Check In" })).toBeNull();
  });

  it("hides Check In for Follower role even when paused on a breadcrumb", async () => {
    setEnabled(true);
    // Two breadcrumbs so canReplayTrip (pins.length > 1) lets the HUD activate.
    const breadcrumbs = [
      { _id: "bc-1", lat: 47.61, lon: -122.31, sampledAt: 1000 },
      { _id: "bc-2", lat: 47.62, lon: -122.32, sampledAt: 10000 },
    ];
    convexQuery.mockResolvedValueOnce({
      page: breadcrumbs,
      isDone: true,
      continueCursor: "",
    });
    setupQueries({
      journalEvents: [],
      // Follower needs the Traveler to opt-in to live-trail visibility for replay to show breadcrumbs.
      followerLiveTrail: { visible: true, samples: breadcrumbs },
      allowFollowersTripPath: true,
    });

    render(<TripMap token="test-token" role="follower" />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    await screen.findByRole("group", { name: "Trip Replay" });
    const pauseBtn = screen.getByRole("button", { name: /pause replay/i });
    fireEvent.click(pauseBtn);

    // Follower is paused on a breadcrumb — the role gate must still hide Check In.
    expect(screen.queryByRole("button", { name: "Check In" })).toBeNull();
  });

  it("hides Check In when paused on a story (checkpoint) pin", async () => {
    setEnabled(true);
    convexQuery.mockResolvedValueOnce({ page: [], isDone: true, continueCursor: "" });
    // Two story pins so canReplayTrip (pins.length > 1) lets the Replay HUD open;
    // the playhead starts on a checkpoint, which is exactly what we want to assert against.
    const storyEvents = [
      makeJournalEvent({ _id: "story-1", occurredAt: 1000, lat: 47.61, lon: -122.31, title: "Pike Place" }),
      makeJournalEvent({ _id: "story-2", occurredAt: 2000, lat: 47.62, lon: -122.32, title: "Pioneer Square" }),
    ];
    setupQueries({ journalEvents: storyEvents });

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    await screen.findByRole("group", { name: "Trip Replay" });
    const pauseBtn = screen.getByRole("button", { name: /pause replay/i });
    fireEvent.click(pauseBtn);

    // The only pin in the replay is a story (checkpoint kind) — no Check In should appear.
    expect(screen.queryByRole("button", { name: "Check In" })).toBeNull();
  });

  it("does not connect path to livePosition when GPS sharing is off", async () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        expect.anything(),
        null,
        "#444444",
        [],
        false,
      );
    });
  });

  describe("Movement Detection gating", () => {
    it("keeps the local GPS dot but suppresses publish and activity while Live is off", async () => {
      // Live is off (default), so the foreground browser watcher drives fixes —
      // not the native watcher. Native is "available" so the movement-detection
      // code path is reachable and we can prove the gate suppresses it.
      nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(true);
      geolocationWatchPosition.mockImplementation((onSuccess) => {
        onSuccess({
          coords: { latitude: 47.6, longitude: -122.3, accuracy: 5, speed: 2.0 },
        });
        return 7;
      });

      setupQueries({
        travelerPreferences: {
          movementDetectionEnabled: true,
          movementWalkingThresholdMps: 1.0, // 1 m/s
        },
      });

      render(<TripMap token="test-token" role="traveler" />);

      // The local GPS dot still renders while Live is off...
      await waitFor(() => {
        expect(getTravelerMarker()).toBeDefined();
      });
      // ...but nothing is published to Followers...
      expect(updateTravelerLocation).not.toHaveBeenCalled();
      // ...and activity is never auto-updated while Live is off.
      expect(applyMovementDetection).not.toHaveBeenCalled();
    });

    it("does not fire on a single moving fix while Live is on (hysteresis)", async () => {
      nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(true);
      let onFixCallback: (fix: any) => void = () => {};
      nativeLocationMocks.startNativeLocationWatch.mockImplementation((onFix) => {
        onFixCallback = onFix;
        return vi.fn();
      });

      setupQueries({
        travelerPreferences: {
          movementDetectionEnabled: true,
          movementWalkingThresholdMps: 1.0,
          movementMovingThresholdMps: 5.0,
        },
      });

      render(<TripMap token="test-token" role="traveler" />);
      fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

      // A single walking-speed fix must not be enough to flip activity.
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 2.0 });
      });

      expect(applyMovementDetection).not.toHaveBeenCalled();
    });

    it("fires after two consecutive agreeing fixes while Live is on", async () => {
      nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(true);
      let onFixCallback: (fix: any) => void = () => {};
      nativeLocationMocks.startNativeLocationWatch.mockImplementation((onFix) => {
        onFixCallback = onFix;
        return vi.fn();
      });

      setupQueries({
        travelerPreferences: {
          movementDetectionEnabled: true,
          movementWalkingThresholdMps: 1.0,
          movementMovingThresholdMps: 5.0,
        },
      });

      render(<TripMap token="test-token" role="traveler" />);
      fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

      // Two consecutive walking-speed fixes clear the streak threshold.
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 2.0 });
      });
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 2.0 });
      });

      await waitFor(() => {
        expect(applyMovementDetection).toHaveBeenCalledWith(
          expect.objectContaining({
            classification: "walking",
            speedMps: 2.0,
          }),
        );
      });
      expect(applyMovementDetection).toHaveBeenCalledTimes(1);
    });

    it("does not fire when classifications alternate and never sustain", async () => {
      nativeLocationMocks.isNativeLocationAvailable.mockReturnValue(true);
      let onFixCallback: (fix: any) => void = () => {};
      nativeLocationMocks.startNativeLocationWatch.mockImplementation((onFix) => {
        onFixCallback = onFix;
        return vi.fn();
      });

      setupQueries({
        travelerPreferences: {
          movementDetectionEnabled: true,
          movementWalkingThresholdMps: 1.0,
          movementMovingThresholdMps: 5.0,
        },
      });

      render(<TripMap token="test-token" role="traveler" />);
      fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

      // walking -> moving -> walking never reaches two in a row.
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 2.0 });
      });
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 6.0 });
      });
      act(() => {
        onFixCallback({ lat: 47.6, lon: -122.3, accuracy: 5, speed: 2.0 });
      });

      expect(applyMovementDetection).not.toHaveBeenCalled();
    });

    it("displays the updated UI copy in TravelerStateSheet", async () => {
      setupQueries();
      render(<TripMap token="test-token" role="traveler" />);

      // Open Traveler State sheet
      fireEvent.click(screen.getByRole("button", { name: /Traveler status/i }));

      expect(await screen.findByText("Auto-sets your activity from GPS while Live is on.")).toBeInTheDocument();
      expect(screen.getByText("Detect movement while Live is on")).toBeInTheDocument();
    });
  });
});

describe("TripMap fix overlay debug densifier", () => {
  // The densifier is a 4s getCurrentPosition poll that runs only while the GPS Fix
  // Overlay debug toggle is on. It feeds the real sampler a dense stream so the
  // overlay finally shows the close-spaced fixes the native 50m distanceFilter would
  // otherwise eat — rejected (red) while stationary, emitted (green) on movement.
  afterEach(() => {
    // Reset module-level cached flag so it can't leak into other suites.
    setFixOverlayEnabled(false);
  });

  function overlayFeatureOutcomes(): string[] {
    const map = mapInstances.at(-1);
    const calls = (map?.addSource as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === "live-trail-fix-overlay",
    );
    const last = calls.at(-1);
    const data = last?.[1] as { data?: { features?: Array<{ properties?: { outcome?: string } }> } } | undefined;
    return (data?.data?.features ?? []).map((f) => f.properties?.outcome ?? "");
  }

  it("polls getCurrentPosition on a 4s cadence only while the overlay is enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    setFixOverlayEnabled(true);
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({ coords: { latitude: 47.62, longitude: -122.34, accuracy: 9 } });
      return 42;
    });
    geolocationGetCurrentPosition.mockImplementation((onSuccess: (p: unknown) => void) => {
      onSuccess({ coords: { latitude: 47.62, longitude: -122.34, accuracy: 9 } });
    });
    setupQueries({
      liveTrailStatus: { enabled: true, visibleToFollowers: false, sampleCount: 0, samples: [] },
    });

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));

    // Sharing emits via the watch, not getCurrentPosition — the poll starts at 0.
    const before = geolocationGetCurrentPosition.mock.calls.length;
    act(() => { vi.advanceTimersByTime(4000); });
    expect(geolocationGetCurrentPosition.mock.calls.length).toBe(before + 1);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(geolocationGetCurrentPosition.mock.calls.length).toBe(before + 2);

    vi.useRealTimers();
  });

  it("never polls getCurrentPosition while the overlay is off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    setFixOverlayEnabled(false);
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({ coords: { latitude: 47.62, longitude: -122.34, accuracy: 9 } });
      return 42;
    });
    setupQueries({
      liveTrailStatus: { enabled: true, visibleToFollowers: false, sampleCount: 0, samples: [] },
    });

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));

    // Baseline ignores the one-shot launch fix; the densifier must add nothing.
    const before = geolocationGetCurrentPosition.mock.calls.length;
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(geolocationGetCurrentPosition.mock.calls.length).toBe(before);

    vi.useRealTimers();
  });

  it("rejects stationary polled fixes (red dots) and emits after moving >50m (green dot)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    setFixOverlayEnabled(true);
    geolocationWatchPosition.mockImplementation((onSuccess) => {
      onSuccess({ coords: { latitude: 47.62, longitude: -122.34, accuracy: 9 } });
      return 42;
    });
    // Stationary: every poll returns the same coordinates as the opening breadcrumb.
    geolocationGetCurrentPosition.mockImplementation((onSuccess: (p: unknown) => void) => {
      onSuccess({ coords: { latitude: 47.62, longitude: -122.34, accuracy: 9 } });
    });
    setupQueries({
      liveTrailStatus: { enabled: true, visibleToFollowers: false, sampleCount: 0, samples: [] },
    });

    render(<TripMap token="test-token" role="traveler" />);
    fireEvent.click(screen.getByRole("button", { name: /Start sharing live location/i }));

    // Opening force-emit on share: one recorded breadcrumb (green).
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(1);

    // Three stationary polls within the 120s heartbeat: all rejected, no new emits.
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(1);
    // The overlay buffer holds the rejected (red) fixes the user was missing.
    expect(overlayFeatureOutcomes()).toContain("rejected");

    // Move >50m (0.001 deg lat ≈ 111m): the next poll emits (green).
    geolocationGetCurrentPosition.mockImplementation((onSuccess: (p: unknown) => void) => {
      onSuccess({ coords: { latitude: 47.621, longitude: -122.34, accuracy: 9 } });
    });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(2);
    expect(overlayFeatureOutcomes()).toContain("emitted");

    vi.useRealTimers();
  });
});
