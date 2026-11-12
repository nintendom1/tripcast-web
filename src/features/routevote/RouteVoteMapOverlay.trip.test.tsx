import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RouteVoteMapOverlay as RouteVoteMapOverlayType } from "../../convex/tripcastApi";
import { renderWithTrip, travelerFollowingCurrent, travelerViewingPrivately } from "../../test/renderWithTrip";
import RouteVoteMapOverlay from "../map/RouteVoteMapOverlay";

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

const currentTrip = {
  tripId: "trip-current",
  title: "Current Trip",
  lifecycle: "in_progress" as const,
  isLegacy: false,
  revision: 1,
  publishingEpoch: 1,
  epochStartedAt: 1,
  multiTripEnabled: true,
};

const overlay: RouteVoteMapOverlayType = {
  travelerLocation: { lat: 47.6, lon: -122.3 },
  coordinateOptions: [{ optionId: "option-2", title: "Cafe", lat: 47.62, lon: -122.34 }],
};

describe("RouteVoteMapOverlay on a viewed trip", () => {
  it("does not draw on a privately viewed trip", () => {
    const map = makeMap();
    renderWithTrip(<RouteVoteMapOverlay map={map as never} overlay={overlay} />, { trip: travelerViewingPrivately });
    expect(map.addSource).not.toHaveBeenCalled();
  });

  it("still draws while following the shared current trip and with no provider", () => {
    const map = makeMap();
    renderWithTrip(<RouteVoteMapOverlay map={map as never} overlay={overlay} />, { trip: { ...travelerFollowingCurrent, currentTrip } });
    expect(map.addSource).toHaveBeenCalledTimes(1);
    const plain = makeMap();
    render(<RouteVoteMapOverlay map={plain as never} overlay={overlay} />);
    expect(plain.addSource).toHaveBeenCalledTimes(1);
  });
});

describe("RouteVoteMapOverlay compares trip ids", () => {
  it("draws when the privately viewed trip has become the shared current trip", () => {
    const map = makeMap();
    renderWithTrip(<RouteVoteMapOverlay map={map as never} overlay={overlay} />, {
      trip: {
        ...travelerViewingPrivately,
        currentTrip: {
          tripId: "trip-other",
          title: "Other Trip",
          lifecycle: "in_progress",
          isLegacy: false,
          revision: 1,
          publishingEpoch: 1,
          epochStartedAt: 1,
          multiTripEnabled: true,
        },
      },
    });
    expect(map.addSource).toHaveBeenCalledTimes(1);
  });
});
