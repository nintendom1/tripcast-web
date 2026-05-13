import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import type { RouteVoteMapOverlay as RouteVoteMapOverlayType } from "../../convex/tripcastApi";
import { isFiniteRouteCoordinate } from "../../lib/routeVoteUtils";

const SOURCE_ID = "route-vote-overlay";
const LINES_LAYER_ID = "route-vote-lines";
const POINTS_LAYER_ID = "route-vote-points";
const LABELS_LAYER_ID = "route-vote-labels";

type RouteVoteMapOverlayProps = {
  map: maplibregl.Map | null;
  overlay: RouteVoteMapOverlayType | null;
  fallbackOrigin?: { lat: number; lon: number } | null;
  optionNumberById?: Record<string, number> | null;
};

function removeOverlayLayers(map: maplibregl.Map) {
  if (map.getLayer(LABELS_LAYER_ID)) map.removeLayer(LABELS_LAYER_ID);
  if (map.getLayer(POINTS_LAYER_ID)) map.removeLayer(POINTS_LAYER_ID);
  if (map.getLayer(LINES_LAYER_ID)) map.removeLayer(LINES_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

function addOverlayLayers(
  map: maplibregl.Map,
  overlay: RouteVoteMapOverlayType,
  fallbackOrigin?: { lat: number; lon: number } | null,
  optionNumberById?: Record<string, number> | null,
) {
  const { travelerLocation, coordinateOptions } = overlay;
  const origin = isFiniteRouteCoordinate(travelerLocation)
    ? travelerLocation
    : isFiniteRouteCoordinate(fallbackOrigin)
      ? fallbackOrigin
      : null;
  const validOptions = coordinateOptions.filter(isFiniteRouteCoordinate);

  if (validOptions.length === 0) return;

  const lines = origin
    ? validOptions.map((opt, index) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [origin.lon, origin.lat],
            [opt.lon, opt.lat],
          ],
        },
        properties: {
          optionId: opt.optionId,
          title: opt.title,
          optionNumber: optionNumberById?.[opt.optionId] ?? index + 1,
        },
      }))
    : [];

  const points = validOptions.map((opt, index) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [opt.lon, opt.lat],
    },
    properties: {
      title: opt.title,
      optionId: opt.optionId,
      optionNumber: optionNumberById?.[opt.optionId] ?? index + 1,
    },
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
      "circle-radius": 10,
      "circle-color": "#c9a84c",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: LABELS_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["==", "$type", "Point"],
    layout: {
      "text-field": ["to-string", ["get", "optionNumber"]],
      "text-size": 12,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });
}

export default function RouteVoteMapOverlay({
  map,
  overlay,
  fallbackOrigin,
  optionNumberById,
}: RouteVoteMapOverlayProps) {
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    const doAdd = () => {
      if (cancelled) return;
      removeOverlayLayers(map);
      if (overlay) addOverlayLayers(map, overlay, fallbackOrigin, optionNumberById);
    };

    if (map.isStyleLoaded()) {
      doAdd();
    } else {
      map.once("styledata", doAdd);
    }

    return () => {
      cancelled = true;
      map.off("styledata", doAdd);
      if (map.isStyleLoaded()) removeOverlayLayers(map);
    };
  }, [map, overlay, fallbackOrigin, optionNumberById]);

  return null;
}
