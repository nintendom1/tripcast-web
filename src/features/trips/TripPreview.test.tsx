import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TripPreview as TripPreviewData, TripPreviewRoute } from "../../convex/tripcastApi";
import { routeToPolyline, TripPreview } from "./TripPreview";

const route = (points: Array<[number, number]>, bounds: TripPreviewRoute["bounds"]): TripPreviewRoute => ({
  version: 1,
  bounds,
  points: points.map(([lat, lon]) => ({ lat, lon })),
  builtAt: 0,
  sourceSampleCount: points.length,
});

const preview = (r: TripPreviewRoute | null): TripPreviewData => ({
  tripId: "t",
  previewStatus: "ready",
  previewVersion: 1,
  storyCount: 0,
  missionCount: 0,
  routeVoteCount: 0,
  route: r,
  coverImageUrl: null,
});

const xs = (polyline: string) => polyline.split(" ").map((pair) => Number(pair.split(",")[0]));

describe("routeToPolyline", () => {
  // Stored longitudes are UNWRAPPED across the antimeridian: 179 → 181 (not -179), bounds use the same values.
  const crossing = route(
    [
      [10, 170],
      [11, 175],
      [12, 180],
      [13, 185],
      [14, 190],
    ],
    { minLat: 10, maxLat: 14, minLon: 170, maxLon: 190 },
  );

  it("treats an antimeridian route as continuous: no point wraps back, so no line crosses the sketch", () => {
    const points = xs(routeToPolyline(crossing));
    expect(points).toHaveLength(5);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]).toBeGreaterThan(points[i - 1]);
      // Consecutive points sit about a fifth of the route apart, never a whole sketch width.
      expect(points[i] - points[i - 1]).toBeLessThan(120);
    }
    expect(points.every((x) => x >= 0 && x <= 240)).toBe(true);
  });

  it("fits the sketch to the stored bounds, however far past 180 they run", () => {
    const far = route(
      [
        [0, 179],
        [0, 359],
      ],
      { minLat: 0, maxLat: 0, minLon: 179, maxLon: 359 },
    );
    const points = xs(routeToPolyline(far));
    expect(points[0]).toBeCloseTo(8, 0);
    expect(points[1]).toBeCloseTo(232, 0);
  });

  it("returns nothing for no points, and a finite centred point for all-zero bounds", () => {
    const empty = route([], { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 });
    expect(routeToPolyline(empty)).toBe("");
    const single = routeToPolyline(route([[0, 0]], { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }));
    expect(single).not.toMatch(/NaN|Infinity/);
    expect(single).toBe("120.0,60.0");
  });
});

describe("TripPreview", () => {
  it("draws one polyline for an antimeridian route", () => {
    render(<TripPreview state={{ status: "ready", preview: preview(crossing()) }} />);
    expect(screen.getByRole("img", { name: "Route sketch" }).querySelectorAll("polyline")).toHaveLength(1);
  });

  it("shows the placeholder, not a sketch, for zero points and all-zero bounds", () => {
    const empty = route([], { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 });
    render(<TripPreview state={{ status: "ready", preview: preview(empty) }} />);
    expect(screen.getByText("No route preview yet")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Route sketch" })).not.toBeInTheDocument();
  });
});

function crossing(): TripPreviewRoute {
  return route(
    [
      [10, 179],
      [10, 181],
    ],
    { minLat: 10, maxLat: 10, minLon: 179, maxLon: 181 },
  );
}
