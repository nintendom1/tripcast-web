import { useEffect, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";

export type LiveTrailPoint = {
  lat: number;
  lon: number;
  sampledAt: number;
};

export function useLiveTrailPath(
  map: maplibregl.Map | null,
  samples: LiveTrailPoint[],
  visible: boolean,
) {
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!map) {
      setMapLoaded(false);
      return;
    }
    if (map.isStyleLoaded()) {
      setMapLoaded(true);
      return;
    }
    const handleLoad = () => setMapLoaded(true);
    map.once("load", handleLoad);
    return () => {
      map.off("load", handleLoad);
    };
  }, [map]);

  const pathData = useMemo(() => {
    if (!visible) return null;
    const coords = samples
      .filter((sample) => Number.isFinite(sample.lat) && Number.isFinite(sample.lon))
      .sort((a, b) => a.sampledAt - b.sampledAt)
      .map((sample) => [sample.lon, sample.lat]);
    if (coords.length < 2) return null;
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        },
      ],
    } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
  }, [samples, visible]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    const sourceId = "live-trail";
    const layerId = "live-trail-layer";

    if (!pathData) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: pathData });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#d92332",
          "line-width": 4,
          "line-opacity": 0.72,
        },
      });
    } else {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(pathData);
    }
  }, [map, mapLoaded, pathData]);
}
