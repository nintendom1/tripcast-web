import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { logMapEvent } from "../../debug/debugLogger";
import { circlePolygon } from "./circlePolygon";
import type { CloakingPin } from "../../convex/tripcastApi";

const SOURCE_ID = "cloaking-zones";
const FILL_LAYER_ID = "cloaking-zones-fill";
const LINE_LAYER_ID = "cloaking-zones-line";

// Matches --teal (#7a9cdc) from ThemeProvider — visually distinct from mission markers (--plum).
const ZONE_COLOR = "#7a9cdc";
// Grey — visually "incognito", distinct from all other pin types.
const PIN_COLOR = "#6b7280";

export function useCloakingZones(
  map: maplibregl.Map | null,
  pins: CloakingPin[],
  onPinClick: (pin: CloakingPin) => void,
) {
  const zonesData = useMemo(() => {
    if (pins.length === 0) return null;
    return {
      type: "FeatureCollection",
      features: pins.map((pin) => ({
        ...circlePolygon(pin.lat, pin.lon, pin.radiusMeters),
        properties: { pinId: pin._id, label: pin.label ?? null },
      })),
    } as GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  }, [pins]);

  // Stable refs so the effect closure captures the latest values without re-running.
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  useEffect(() => {
    if (!map) return;

    const markers: maplibregl.Marker[] = [];

    const addMarkers = () => {
      for (const pin of pinsRef.current) {
        const marker = new maplibregl.Marker({ color: PIN_COLOR })
          .setLngLat([pin.lon, pin.lat])
          .addTo(map);
        const el = marker.getElement();
        el.style.cursor = "pointer";
        const captured = pin;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onPinClickRef.current(captured);
        });
        markers.push(marker);
      }
    };

    const addLayers = () => {
      map.addSource(SOURCE_ID, { type: "geojson", data: zonesData! });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": ZONE_COLOR,
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": ZONE_COLOR,
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      });
      logMapEvent("map:cloaking-zones:add", { count: zonesData?.features.length ?? 0 });
    };

    const sync = () => {
      if (!map.isStyleLoaded()) return;
      if (!zonesData) {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }
      if (!map.getSource(SOURCE_ID)) {
        addLayers();
      } else {
        (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(zonesData);
      }
    };

    const ensureAfterStyle = (e?: { type?: string }) => {
      if (map.getSource(SOURCE_ID)) return;
      const styleReady = e?.type === "style.load" || e?.type === "load";
      if ((styleReady || map.isStyleLoaded()) && zonesData) addLayers();
    };

    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
    map.on("style.load", ensureAfterStyle);
    map.on("styledata", ensureAfterStyle);
    map.on("idle", ensureAfterStyle);

    // Markers are DOM overlays — safe to add immediately regardless of style state.
    if (pinsRef.current.length > 0) addMarkers();

    return () => {
      map.off("load", sync);
      map.off("style.load", ensureAfterStyle);
      map.off("styledata", ensureAfterStyle);
      map.off("idle", ensureAfterStyle);
      markers.forEach((m) => m.remove());
    };
  }, [map, zonesData]);
}
