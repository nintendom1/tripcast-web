import { useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { logMapEvent } from "../../debug/debugLogger";
import type { RecentFix } from "../../lib/pendingFixesBuffer";

export function useFixOverlay(
  map: maplibregl.Map | null,
  fixes: RecentFix[],
  visible: boolean,
) {
  const overlayData = useMemo(() => {
    if (!visible) return null;
    const valid = fixes.filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon));
    if (valid.length === 0) return null;
    const features: GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString>[] = valid.map((fix) => ({
      type: "Feature" as const,
      properties: { outcome: fix.outcome },
      geometry: { type: "Point" as const, coordinates: [fix.lon, fix.lat] },
    }));
    // Connect the dots in chronological order so the overlay carries its own
    // trail line. Same source as the dots, so the line and dots can never
    // disagree (unlike the separate useTripPath route). Kept visually distinct
    // from that dashed route line.
    if (valid.length >= 2) {
      const ordered = [...valid].sort((a, b) => a.sampledAt - b.sampledAt);
      features.push({
        type: "Feature" as const,
        properties: { outcome: "line" },
        geometry: {
          type: "LineString" as const,
          coordinates: ordered.map((fix) => [fix.lon, fix.lat]),
        },
      });
    }
    return {
      type: "FeatureCollection" as const,
      features,
    } satisfies GeoJSON.FeatureCollection<GeoJSON.Point | GeoJSON.LineString>;
  }, [fixes, visible]);

  useEffect(() => {
    if (!map) return;
    const sourceId = "live-trail-fix-overlay";
    const layerId = "live-trail-fix-overlay-layer";
    const lineLayerId = "live-trail-fix-overlay-line";

    const addLayer = () => {
      map.addSource(sourceId, { type: "geojson", data: overlayData! });
      // Connecting line first so the dots render on top of it.
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#60a5fa",
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 4,
          "circle-color": [
            "match",
            ["get", "outcome"],
            "emitted", "#22c55e",
            "rejected", "#ef4444",
            "#888888",
          ],
          "circle-opacity": 0.75,
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      logMapEvent("map:fix-overlay:re-add", { layerId });
    };

    const sync = () => {
      if (!map.isStyleLoaded()) return;
      if (!overlayData) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        return;
      }
      if (!map.getSource(sourceId)) {
        addLayer();
      } else {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(overlayData);
      }
    };

    const ensureAfterStyle = (e?: { type?: string }) => {
      if (map.getSource(sourceId)) return;
      const styleReady = e?.type === "style.load" || e?.type === "load";
      if ((styleReady || map.isStyleLoaded()) && overlayData) addLayer();
    };

    // Always run sync once so a null overlayData tears down the layer cleanly.
    if (map.isStyleLoaded()) sync();

    // Only subscribe to style-reload events when we actually have data to keep
    // alive — otherwise the no-op hook would overwrite other hooks' single-slot
    // style.load handler (notably the traveler-accuracy-circle effect).
    if (!overlayData) return;

    if (!map.isStyleLoaded()) map.once("load", sync);
    map.on("style.load", ensureAfterStyle);
    map.on("styledata", ensureAfterStyle);
    map.on("idle", ensureAfterStyle);
    return () => {
      map.off("load", sync);
      map.off("style.load", ensureAfterStyle);
      map.off("styledata", ensureAfterStyle);
      map.off("idle", ensureAfterStyle);
    };
  }, [map, overlayData]);
}
