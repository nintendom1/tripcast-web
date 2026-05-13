import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import TripMap from "./TripMap";

const mapEaseTo = vi.fn();
const markerElements: HTMLElement[] = [];
const geolocationWatchPosition = vi.fn();
const geolocationClearWatch = vi.fn();
const updateTravelerLocation = vi.fn();
const stopTravelerLocationSharing = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

vi.mock("maplibre-gl", () => {
  class MockMap {
    constructor() {}

    addControl = vi.fn();
    on = vi.fn();
    remove = vi.fn();
    getZoom = vi.fn(() => 12);
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
  default: () => null,
}));

vi.mock("./RouteVoteMapOverlay", () => ({
  default: () => null,
}));

vi.mock("./ChallengeMarkers", () => ({
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
  default: () => null,
}));

vi.mock("../routevote/RouteVoteProgress", () => ({
  default: () => null,
}));

function setupQueries({
  checkpoints = [],
  travelerLocation = null,
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
  travelerLocation?: { lat: number; lon: number; isSharing: true } | null;
} = {}) {
  (vi.mocked(convexReact.useQuery) as any).mockImplementation((query: unknown) => {
    if (query === tripcastApi.checkpoints.listCheckpoints) return checkpoints;
    if (query === tripcastApi.travelerLocations.getTravelerLocation) {
      return travelerLocation;
    }
    if (query === tripcastApi.routeVotes.travelerListRouteVotes) return [];
    return null;
  });
}

function getTravelerMarker() {
  return markerElements
    .filter((el) => el.className.includes("traveler-location-marker"))
    .at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  markerElements.length = 0;
  updateTravelerLocation.mockResolvedValue(null);
  stopTravelerLocationSharing.mockResolvedValue(null);

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

describe("TripMap location marker", () => {
  it("pulses the follower marker when traveler location is actively shared", async () => {
    setupQueries({
      travelerLocation: { lat: 47.61, lon: -122.33, isSharing: true },
    });

    render(<TripMap token="test-token" role="support_crew" />);

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

    fireEvent.click(screen.getByRole("button", { name: /share location/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /share location/i }));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      expect(stopTravelerLocationSharing).toHaveBeenCalledWith({
        token: "test-token",
      });
    });
  });
});
