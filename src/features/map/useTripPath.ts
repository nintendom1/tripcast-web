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
  visible: boolean
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
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(-100);

    const coords = validPins.map((cp) => [cp.lon!, cp.lat!]);

    if (livePosition) {
      coords.push([livePosition.lon, livePosition.lat]);
    }

    if (coords.length < 2) return null;

    // Split the path into segments to create a fading effect.
    // More recent segments (end of array) have higher opacity.
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const numSegments = 5;
    const segmentSize = Math.max(1, Math.ceil(coords.length / numSegments));

    for (let i = 0; i < coords.length - 1; i += segmentSize) {
      const segmentCoords = coords.slice(i, i + segmentSize + 1);
      if (segmentCoords.length < 2) continue;

      // Opacity from 0.15 (oldest) to 0.7 (newest)
      const progress = i / (coords.length - 1);
      const opacity = 0.15 + progress * 0.55;

      features.push({
        type: "Feature",
        properties: { opacity },
        geometry: {
          type: "LineString",
          coordinates: segmentCoords,
        },
      });
    }

    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
  }, [checkpoints, livePosition, visible]);

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
          "line-color": "#666666", // Neutral tone
          "line-width": 2,
          "line-dasharray": [1.5, 1.5], // Tight dash pattern
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