import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import type { RouteVoteMapOverlay as RouteVoteMapOverlayType } from "../../convex/tripcastApi";

const SOURCE_ID = "route-vote-overlay";
const LINES_LAYER_ID = "route-vote-lines";
const POINTS_LAYER_ID = "route-vote-points";

type RouteVoteMapOverlayProps = {
  map: maplibregl.Map | null;
  overlay: RouteVoteMapOverlayType | null;
};

function removeOverlayLayers(map: maplibregl.Map) {
  if (map.getLayer(POINTS_LAYER_ID)) map.removeLayer(POINTS_LAYER_ID);
  if (map.getLayer(LINES_LAYER_ID)) map.removeLayer(LINES_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

function addOverlayLayers(map: maplibregl.Map, overlay: RouteVoteMapOverlayType) {
  const { travelerLocation, coordinateOptions } = overlay;

  if (!travelerLocation || coordinateOptions.length === 0) return;

  const lines = coordinateOptions.map((opt) => ({
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [travelerLocation.lon, travelerLocation.lat],
        [opt.lon, opt.lat],
      ],
    },
    properties: { optionId: opt.optionId, title: opt.title },
  }));

  const points = coordinateOptions.map((opt) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [opt.lon, opt.lat],
    },
    properties: { title: opt.title },
  }));

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [...lines, ...points],
    },
  });

  map.addLayer({
    id: LINES_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", "$type", "LineString"],
    paint: {
      "line-color": "#c9a84c",
      "line-width": 2,
      "line-dasharray": [4, 3],
      "line-opacity": 0.8,
    },
  });

  map.addLayer({
    id: POINTS_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": "#c9a84c",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

export default function RouteVoteMapOverlay({ map, overlay }: RouteVoteMapOverlayProps) {
  useEffect(() => {
    if (!map) return;

    const doAdd = () => {
      removeOverlayLayers(map);
      if (overlay) addOverlayLayers(map, overlay);
    };

    if (map.isStyleLoaded()) {
      doAdd();
    } else {
      map.once("styledata", doAdd);
    }

    return () => {
      if (map.isStyleLoaded()) removeOverlayLayers(map);
    };
  }, [map, overlay]);

  return null;
}
