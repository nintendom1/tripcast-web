import { useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { Checkpoint } from "../../convex/tripcastApi";
import { logMapEvent } from "../../debug/debugLogger";

/**
 * Custom hook to render a chronological dashed path connecting checkpoints.
 * The path fades out (lower opacity) for older segments.
 */
export function useTripPath(
  map: maplibregl.Map | null,
  checkpoints: Checkpoint[],
  livePosition: { lat: number; lon: number } | null,
  visible: boolean,
  playheadTime: number | null = null,
  lineColor: string = "#444444",
) {
  const pathData = useMemo(() => {
    if (!visible) return null;

    // Filter pins with coordinates and sort by creation time
    const validPins = checkpoints
      .filter((cp) => cp.lat !== undefined && cp.lon !== undefined)
      .filter((cp) => playheadTime === null || cp.createdAt <= playheadTime)
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(-100);

    const coords = validPins.map((cp) => [cp.lon!, cp.lat!]);

    if (livePosition && playheadTime === null) {
      coords.push([livePosition.lon, livePosition.lat]);
    }

    if (coords.length < 2) return null;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    // Define the "strength" block: the most recent 5 segments (6 points).
    // This includes the live segment (lastPin -> livePosition) if emitting.
    const strengthPointCount = 6;
    const strengthStartIndex = Math.max(0, coords.length - strengthPointCount);

    // 1. Fading Tail: Everything before the strength block
    if (strengthStartIndex > 0) {
      const tailCoords = coords.slice(0, strengthStartIndex + 1);
      const numTailSegments = 4;
      const tailSegmentSize = Math.max(1, Math.ceil(tailCoords.length / numTailSegments));

      for (let i = 0; i < tailCoords.length - 1; i += tailSegmentSize) {
        const segment = tailCoords.slice(i, i + tailSegmentSize + 1);
        if (segment.length < 2) continue;

        // Fade from 0.2 (oldest) up toward 0.95
        const progress = i / (tailCoords.length - 1);
        const opacity = 0.2 + progress * (0.95 - 0.2);

        features.push({
          type: "Feature",
          properties: { opacity },
          geometry: { type: "LineString", coordinates: segment },
        });
      }
    }

    // 2. Strength Block: Most recent segments at constant high opacity
    const strengthCoords = coords.slice(strengthStartIndex);
    features.push({
      type: "Feature",
      properties: { opacity: 0.95 },
      geometry: {
        type: "LineString",
        coordinates: strengthCoords,
      },
    });

    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
  }, [checkpoints, livePosition, visible, playheadTime]);

  useEffect(() => {
    if (!map) return;

    const sourceId = "trip-path";
    const layerId = "trip-path-layer";

    const addLayer = () => {
      map.addSource(sourceId, { type: "geojson", data: pathData! });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": lineColor,
          "line-width": 3.5,
          "line-dasharray": [2, 2],
          "line-opacity": ["get", "opacity"],
        },
      });
      logMapEvent("map:route-path:re-add", { layerId, lineColor });
    };

    // Full reconcile against the current data/color.
    const sync = () => {
      if (!map.isStyleLoaded()) return; // styledata will re-fire when ready
      if (!pathData) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        return;
      }
      if (!map.getSource(sourceId)) {
        addLayer();
      } else {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(pathData);
        map.setPaintProperty(layerId, "line-color", lineColor);
      }
    };

    // Re-add when the layer is missing (e.g. setStyle wiped it). "style.load" /
    // "load" fire when the style spec is parsed (MapLibre Style._loaded === true),
    // which is all addSource/addLayer need — so treat those as "ready" WITHOUT the
    // isStyleLoaded() gate. isStyleLoaded() only flips true once tiles/sources also
    // load (≈ the "idle" event ~0.7s later); gating on it was the whole delay.
    const ensureAfterStyle = (e?: { type?: string }) => {
      if (map.getSource(sourceId)) return;
      const styleReady = e?.type === "style.load" || e?.type === "load";
      if ((styleReady || map.isStyleLoaded()) && pathData) addLayer();
    };

    logMapEvent("map:route-path:effect", {
      layerId,
      styleLoaded: map.isStyleLoaded(),
      hasData: !!pathData,
      layerExists: !!map.getSource(sourceId),
      lineColor,
    });

    // Initial trigger: run now if the style is already loaded, otherwise wait for
    // the one-shot "load". styledata then handles re-adds after each setStyle.
    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    // PASS 1 PROBE: route all three candidate events through ensureAfterStyle so
    // the log trace reveals the earliest reliable re-add trigger.
    map.on("style.load", ensureAfterStyle);
    map.on("styledata", ensureAfterStyle);
    map.on("idle", ensureAfterStyle);
    return () => {
      map.off("load", sync);
      map.off("style.load", ensureAfterStyle);
      map.off("styledata", ensureAfterStyle);
      map.off("idle", ensureAfterStyle);
    };
  }, [map, pathData, lineColor]);
}
