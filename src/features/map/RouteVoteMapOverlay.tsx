import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import type { RouteVoteMapOverlay as RouteVoteMapOverlayType } from "../../convex/tripcastApi";
import { isFiniteRouteCoordinate } from "../../lib/routeVoteUtils";
import { useTheme } from "../../providers/ThemeProvider";
import { logMapEvent } from "../../debug/debugLogger";

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
  accentColor: string,
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
      "line-color": accentColor,
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
      "circle-color": accentColor,
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
  const { resolvedTheme } = useTheme();
  const accentColor = resolvedTheme === "constellation" ? "#ffd86a" : "#c9a84c";

  useEffect(() => {
    if (!map) return;

    const addOverlay = () => {
      if (!overlay) return;
      addOverlayLayers(map, overlay, accentColor, fallbackOrigin, optionNumberById);
      logMapEvent("map:route-path:re-add", {
        layerId: LINES_LAYER_ID,
        lineColor: accentColor,
      });
    };

    // Full reconcile against current overlay/color.
    const sync = () => {
      if (!map.isStyleLoaded()) return; // styledata will re-fire when ready
      removeOverlayLayers(map);
      addOverlay();
    };

    // Re-add only when missing (e.g. setStyle wiped it).
    const ensureAfterStyle = () => {
      if (map.isStyleLoaded() && overlay && !map.getSource(SOURCE_ID)) addOverlay();
    };

    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    // "idle" is the dependable post-setStyle trigger; styledata is a backstop.
    map.on("styledata", ensureAfterStyle);
    map.on("idle", ensureAfterStyle);
    return () => {
      map.off("load", sync);
      map.off("styledata", ensureAfterStyle);
      map.off("idle", ensureAfterStyle);
      if (map.isStyleLoaded()) removeOverlayLayers(map);
    };
  }, [map, overlay, accentColor, fallbackOrigin, optionNumberById]);

  return null;
}
