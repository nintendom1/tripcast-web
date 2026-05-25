import { useEffect, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import { Checkpoint } from "../../convex/tripcastApi";

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
) {
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!map) {
      setMapLoaded(false);
      return;
    }

    if (map.isStyleLoaded()) {
      setMapLoaded(true);
    } else {
      const handleLoad = () => setMapLoaded(true);
      map.once("load", handleLoad);
      return () => {
        map.off("load", handleLoad);
      };
    }
  }, [map]);

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
    if (!map || !mapLoaded) return;

    const sourceId = "trip-path";
    const layerId = "trip-path-layer";

    if (!pathData) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: pathData,
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#444444",
          "line-width": 3.5,
          "line-dasharray": [2, 2],
          "line-opacity": ["get", "opacity"],
        },
      });
    } else {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(pathData);
    }

    return () => {
      // We don't remove here to avoid flicker on every data update, 
      // the empty pathData check above handles removal.
    };
  }, [map, mapLoaded, pathData]);
}
