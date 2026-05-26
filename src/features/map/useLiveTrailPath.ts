import { useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { logMapEvent } from "../../debug/debugLogger";

export type LiveTrailPoint = {
  lat: number;
  lon: number;
  sampledAt: number;
};

export function useLiveTrailPath(
  map: maplibregl.Map | null,
  samples: LiveTrailPoint[],
  visible: boolean,
  lineColor: string = "#444444",
) {
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
    if (!map) return;
    const sourceId = "live-trail";
    const layerId = "live-trail-layer";

    const addLayer = () => {
      map.addSource(sourceId, { type: "geojson", data: pathData! });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": lineColor,
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": 0.72,
        },
      });
      logMapEvent("map:route-path:re-add", { layerId, lineColor });
    };

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

    // Re-add when missing (e.g. setStyle wiped it); never calls setData. "style.load"
    // / "load" mean the style spec is parsed (safe to addLayer) even before tiles
    // finish, so treat them as ready without the isStyleLoaded() gate that delayed
    // the re-add to "idle". See useTripPath for the full rationale.
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

    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    // style.load is the fast post-setStyle trigger; styledata/idle are backstops.
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
