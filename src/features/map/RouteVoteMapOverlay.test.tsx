import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RouteVoteMapOverlay from "./RouteVoteMapOverlay";
import type { RouteVoteMapOverlay as RouteVoteMapOverlayType } from "../../convex/tripcastApi";

type MockFeature = {
  geometry: { type: string };
  properties?: Record<string, unknown>;
};

function makeMap() {
  return {
    getLayer: vi.fn(() => false),
    removeLayer: vi.fn(),
    getSource: vi.fn(() => false),
    removeSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

const overlay: RouteVoteMapOverlayType = {
  travelerLocation: null,
  coordinateOptions: [
    { optionId: "option-2", title: "Cafe", lat: 47.62, lon: -122.34 },
    { optionId: "option-4", title: "Museum", lat: 47.63, lon: -122.35 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RouteVoteMapOverlay", () => {
  it("renders destination pins even without an origin", () => {
    const map = makeMap();

    render(<RouteVoteMapOverlay map={map as never} overlay={overlay} />);

    const source = map.addSource.mock.calls[0][1];
    expect(source.data.features).toHaveLength(2);
    expect(source.data.features.map((feature: MockFeature) => feature.geometry.type)).toEqual([
      "Point",
      "Point",
    ]);
  });

  it("draws fallback-origin lines and labels pins with original option numbers", () => {
    const map = makeMap();

    render(
      <RouteVoteMapOverlay
        map={map as never}
        overlay={overlay}
        fallbackOrigin={{ lat: 47.61, lon: -122.33 }}
        optionNumberById={{ "option-2": 2, "option-4": 4 }}
      />,
    );

    const source = map.addSource.mock.calls[0][1];
    expect(source.data.features.map((feature: MockFeature) => feature.geometry.type)).toEqual([
      "LineString",
      "LineString",
      "Point",
      "Point",
    ]);
    expect(
      source.data.features
        .filter((feature: MockFeature) => feature.geometry.type === "Point")
        .map((feature: MockFeature) => feature.properties?.optionNumber),
    ).toEqual([2, 4]);
  });

  it("filters invalid overlay coordinates before adding the map source", () => {
    const map = makeMap();
    const dirtyOverlay = {
      travelerLocation: { lat: null, lon: null },
      coordinateOptions: [
        { optionId: "bad-option", title: "Bad", lat: null, lon: null },
        { optionId: "option-2", title: "Cafe", lat: 47.62, lon: -122.34 },
      ],
    } as unknown as RouteVoteMapOverlayType;

    render(
      <RouteVoteMapOverlay
        map={map as never}
        overlay={dirtyOverlay}
        fallbackOrigin={{ lat: 47.61, lon: -122.33 }}
      />,
    );

    const source = map.addSource.mock.calls[0][1];
    expect(source.data.features.map((feature: MockFeature) => feature.geometry.type)).toEqual([
      "LineString",
      "Point",
    ]);
  });

  it("cancels pending overlay work on cleanup", () => {
    const map = makeMap();
    map.isStyleLoaded.mockReturnValue(false);

    const { unmount } = render(<RouteVoteMapOverlay map={map as never} overlay={overlay} />);
    // Style not loaded yet, so the initial reconcile is deferred to "load".
    const pendingLoadHandler = map.once.mock.calls[0][1];

    unmount();
    pendingLoadHandler();

    expect(map.off).toHaveBeenCalledWith("load", pendingLoadHandler);
    expect(map.addSource).not.toHaveBeenCalled();
  });
});
