import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi, type JournalEvent } from "../../convex/tripcastApi";
import TripMap from "./TripMap";
import { useTripPath } from "./useTripPath";

const mapEaseTo = vi.fn();
const markerElements: HTMLElement[] = [];
const geolocationWatchPosition = vi.fn();
const geolocationClearWatch = vi.fn();
const updateTravelerLocation = vi.fn();
const stopTravelerLocationSharing = vi.fn();
const fetchMock = vi.fn();
const mapConstructorOptions: unknown[] = [];
const mapInstances: Array<{
  handlers: Record<string, (event: any) => void>;
  remove: ReturnType<typeof vi.fn>;
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

vi.mock("../routevote/RouteVoteProgress", () => ({
  default: () => null,
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
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((query: unknown) => {
    if (query === tripcastApi.checkpoints.listCheckpoints) return checkpoints;
    if (query === tripcastApi.travelerLocations.getTravelerLocation) {
      return travelerLocation;
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  markerElements.length = 0;
  mapConstructorOptions.length = 0;
  mapInstances.length = 0;
  routeVotePanelProps.length = 0;
  updateTravelerLocation.mockResolvedValue(null);
  stopTravelerLocationSharing.mockResolvedValue(null);
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  (vi.mocked(convexReact.useMutation) as any).mockImplementation((mutation: unknown) => {
    if (mutation === tripcastApi.travelerLocations.updateTravelerLocation) {
      return updateTravelerLocation;
    }
    if (mutation === tripcastApi.travelerLocations.stopTravelerLocationSharing) {
      return stopTravelerLocationSharing;
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

  it("closes Traveler State when a Dock sheet opens", async () => {
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    fireEvent.click(screen.getByRole("button", { name: "Traveler status" }));
    expect(await screen.findByRole("heading", { name: "How are you?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Journal" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "How are you?" })).not.toBeInTheDocument();
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

  it("shows traveler current location without pulsing until sharing is enabled", async () => {
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
      expect(getTravelerMarker()).toHaveClass("traveler-location-marker");
    });
    expect(getTravelerMarker()).not.toHaveClass("traveler-location-marker--pulsing");

    fireEvent.click(screen.getByRole("button", { name: /sharing live location/i }));

    await waitFor(() => {
      expect(getTravelerMarker()).toHaveClass("traveler-location-marker--pulsing");
    });
    expect(updateTravelerLocation).toHaveBeenCalledWith({
      token: "test-token",
      lat: 47.62,
      lon: -122.34,
      accuracy: undefined,
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

  it("shows the trip path for traveler based on local storage", async () => {
    localStorage.setItem("tripcast.showTripPath", "true");
    setupQueries();

    render(<TripMap token="test-token" role="traveler" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true
      );
    });

    localStorage.setItem("tripcast.showTripPath", "false");
    // Dispatch event to trigger update in TripMap
    window.dispatchEvent(new Event("tripcast.preferencesUpdated"));

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false
      );
    });
  });

  it("shows the trip path for followers based on traveler preferences", async () => {
    setupQueries({ allowFollowersTripPath: true });

    render(<TripMap token="test-token" role="follower" />);

    await waitFor(() => {
      expect(useTripPath).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        true
      );
    });
  });
});
