import { renderHook } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import type { Checkpoint } from "../../convex/tripcastApi";
import { useTripPath } from "./useTripPath";

function checkpoint(id: string, lat: number, lon: number, createdAt: number): Checkpoint {
  return {
    _id: id,
    _creationTime: createdAt,
    title: id,
    source: "current_activity",
    lat,
    lon,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("useTripPath", () => {
  it("skips setData when a new input array produces identical GeoJSON", () => {
    const setData = vi.fn();
    const source = { setData };
    const map = {
      getSource: vi.fn(() => source),
      getLayer: vi.fn(() => ({ id: "trip-path-layer" })),
      setPaintProperty: vi.fn(),
      isStyleLoaded: vi.fn(() => false),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as maplibregl.Map;
    const initial = [checkpoint("one", 37.5, 127, 1), checkpoint("two", 37.6, 127.1, 2)];
    const { rerender } = renderHook(
      ({ checkpoints }) => useTripPath(map, checkpoints, null, true),
      { initialProps: { checkpoints: initial } },
    );

    expect(setData).toHaveBeenCalledTimes(1);
    rerender({ checkpoints: initial.map((item) => ({ ...item })) });

    expect(setData).toHaveBeenCalledTimes(1);
  });
});
