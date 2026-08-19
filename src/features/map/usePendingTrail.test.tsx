import { renderHook } from "@testing-library/react";
import type maplibregl from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { usePendingTrail, type LocalTrailPoint } from "./usePendingTrail";

type StyleHandler = (event?: { type?: string }) => void;

function createMap(options: { addSourceFailures?: number; styleLoaded?: boolean } = {}) {
  const handlers = new Map<string, StyleHandler>();
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  let addSourceFailures = options.addSourceFailures ?? 0;

  const map = {
    addSource: vi.fn((id: string) => {
      if (addSourceFailures > 0) {
        addSourceFailures -= 1;
        throw new Error("style unavailable");
      }
      sources.set(id, { setData: vi.fn() });
    }),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    getSource: vi.fn((id: string) => sources.get(id)),
    getLayer: vi.fn((id: string) => layers.has(id) ? { id } : undefined),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    setPaintProperty: vi.fn(),
    isStyleLoaded: vi.fn(() => options.styleLoaded ?? true),
    on: vi.fn((event: string, handler: StyleHandler) => handlers.set(event, handler)),
    off: vi.fn((event: string, handler: StyleHandler) => {
      if (handlers.get(event) === handler) handlers.delete(event);
    }),
  };

  return { map: map as unknown as maplibregl.Map, handlers, sources };
}

const points: LocalTrailPoint[] = [
  { clientSampleId: "one", lat: 37.5, lon: 127, sampledAt: 1, status: "pending" },
  { clientSampleId: "two", lat: 37.6, lon: 127.1, sampledAt: 2, status: "pending" },
];

describe("usePendingTrail", () => {
  it("does not resend semantically identical trail data", () => {
    const { map, sources } = createMap();
    const { rerender } = renderHook(
      ({ pending }) => usePendingTrail(map, pending, null, true, "meadow"),
      { initialProps: { pending: points } },
    );
    const setData = sources.get("pending-live-trail")!.setData;

    rerender({ pending: points.map((point) => ({ ...point })) });

    expect(setData).not.toHaveBeenCalled();
  });

  it("recreates the overlay on style.load without relying on isStyleLoaded", () => {
    const { map, handlers } = createMap({ addSourceFailures: 1, styleLoaded: false });
    renderHook(() => usePendingTrail(map, points, null, true, "meadow"));

    handlers.get("style.load")?.({ type: "style.load" });

    expect(map.addSource).toHaveBeenCalledTimes(2);
    expect(map.addLayer).toHaveBeenCalledTimes(4);
  });

  it("opens the trail-only circuit after three consecutive synchronization failures", () => {
    const { map, handlers } = createMap({ addSourceFailures: 3 });
    renderHook(() => usePendingTrail(map, points, null, true, "meadow"));

    handlers.get("styledata")?.({ type: "styledata" });
    handlers.get("styledata")?.({ type: "styledata" });

    expect(map.addSource).toHaveBeenCalledTimes(3);
    expect(map.off).toHaveBeenCalledTimes(4);
    expect(handlers.size).toBe(0);
  });
});
