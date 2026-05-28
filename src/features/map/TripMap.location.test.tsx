import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type JournalEvent } from "../../convex/tripcastApi";
import { clearLogs, getLogs, setEnabled } from "../../debug/debugLogger";
import { ThemeProvider, useTheme } from "../../providers/ThemeProvider";
import TripMap from "./TripMap";
import { useTripPath } from "./useTripPath";

const mapEaseTo = vi.fn();
const markerElements: HTMLElement[] = [];
const geolocationWatchPosition = vi.fn();
const geolocationClearWatch = vi.fn();
const updateTravelerLocation = vi.fn();
const stopTravelerLocationSharing = vi.fn();
const setLiveTrailEnabled = vi.fn();
const setLiveTrailVisibility = vi.fn();
const recordLiveTrailSample = vi.fn();
const deleteRecentLiveTrail = vi.fn();
const fetchMock = vi.fn();
const mapConstructorOptions: unknown[] = [];
const mapInstances: Array<{
  handlers: Record<string, (event: any) => void>;
  remove: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  dragPan: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  scrollZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  boxZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  dragRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  keyboard: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  doubleClickZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  touchZoomRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
}> = [];
const routeVotePanelProps: Array<{
  fallbackOrigin: { lat: number; lon: number } | null;
}> = [];

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
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
    setStyle = vi.fn(() => this);
    on = vi.fn((event: string, handler: (event: any) => void) => {
      this.handlers[event] = handler;
      return this;
    });
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
    easeTo = mapEaseTo;
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
  default: (props: { selectedCoordinate?: { lat: number; lon: number } | null }) =>
    props.selectedCoordinate ? <div data-testid="checkpoint-sheet" /> : null,
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
  default: (props: { fallbackOrigin: { lat: number; lon: number } | null }) => {
    routeVotePanelProps.push({ fallbackOrigin: props.fallbackOrigin });
    return <div data-testid="route-vote-panel" />;
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
  allowFollowersTripPath = false,
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
  travelerLocation?: { lat: number; lon: number; isSharing: true } | null;
  allowFollowersTripPath?: boolean;
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
      return { travelerTimeZone: "UTC" };
    }
    if (query === tripcastApi.journalEvents.listJournalEvents) return journalEvents;
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
  updateTravelerLocation.mockResolvedValue(null);
  stopTravelerLocationSharing.mockResolvedValue(null);
  setLiveTrailEnabled.mockResolvedValue(null);
  setLiveTrailVisibility.mockResolvedValue(null);
  recordLiveTrailSample.mockResolvedValue(null);
  deleteRecentLiveTrail.mockResolvedValue({ deleted: 0 });
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  (vi.mocked(convexReact.useMutation) as any).mockImplementation((mutation: unknown) => {
    if (mutation === tripcastApi.travelerLocations.updateTravelerLocation) {
      return updateTravelerLocation;
    }
    if (mutation === tripcastApi.travelerLocations.stopTravelerLocationSharing) {
      return stopTravelerLocationSharing;
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
    return vi.fn();
  });

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: geolocationWatchPosition,
      clearWatch: geolocationClearWatch,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TripMap location marker", () => {
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
      expect(vi.mocked(useTripPath).mock.calls.some((call) => call[4] === 1000)).toBe(true);
      expect(mapEaseTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ center: [-122.31, 47.61] }),
      );
    });

    const speedSlider = screen.getByLabelText("Replay speed");
    fireEvent.pointerDown(speedSlider);
    expect(speedSlider).toHaveAttribute("max", "16");
    fireEvent.change(speedSlider, { target: { value: "16" } });
    fireEvent.pointerUp(speedSlider);

    await waitFor(() => {
      expect(getLogs().some((entry) => entry.action === "replay:shuttle:drag-start")).toBe(true);
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

  it("offsets map HUD controls away from MapLibre controls", () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    // Mute sits below MapLibre's top-right zoom/compass stack so a status card can't bury it.
    expect(screen.getByRole("button", { name: /mute soundtrack/i })).toHaveClass("top-[148px]");
    expect(screen.getByRole("button", { name: "Center map on traveler" })).toHaveClass("bottom-[118px]");
    expect(screen.getByRole("navigation", { name: "Map sections" }).parentElement).toHaveClass(
      "bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]",
    );
  });

  it("uses the same top HUD row structure for Followers", () => {
    setupQueries();

    render(<TripMap token="test-token" role="follower" />);

    expect(screen.getByRole("group", { name: "Traveler status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replay" }).parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
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

  it("starts browser location watching only after live location sharing is enabled", async () => {
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

    expect(geolocationWatchPosition).not.toHaveBeenCalled();
    expect(getTravelerMarker()).toBeUndefined();

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
      expect(map.setStyle).toHaveBeenCalledWith(expect.stringContaining("style=fiord"));
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

  it("does not emit Live Trail breadcrumbs while Live GPS is off", () => {
    setupQueries({
      liveTrailStatus: {
        enabled: true,
        visibleToFollowers: true,
        sampleCount: 0,
        samples: [],
      },
    });

    render(<TripMap token="test-token" role="traveler" />);

    expect(geolocationWatchPosition).not.toHaveBeenCalled();
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

  it("records Live Trail samples only after 200m movement or 60 seconds", async () => {
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

    nowMs += 30_000;
    onGeolocationSuccess({
      coords: {
        latitude: 47.6201,
        longitude: -122.3401,
        accuracy: 8,
      },
    } as GeolocationPosition);
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(1);

    nowMs += 30_000;
    onGeolocationSuccess({
      coords: {
        latitude: 47.6201,
        longitude: -122.3401,
        accuracy: 8,
      },
    } as GeolocationPosition);
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(2);

    nowMs += 1_000;
    onGeolocationSuccess({
      coords: {
        latitude: 47.623,
        longitude: -122.34,
        accuracy: 8,
      },
    } as GeolocationPosition);
    expect(recordLiveTrailSample).toHaveBeenCalledTimes(3);
    dateNow.mockRestore();
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
});
