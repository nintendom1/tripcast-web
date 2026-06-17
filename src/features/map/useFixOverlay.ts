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
    const features = fixes
      .filter((fix) => Number.isFinite(fix.lat) && Number.isFinite(fix.lon))
      .map((fix) => ({
        type: "Feature" as const,
        properties: { outcome: fix.outcome },
        geometry: { type: "Point" as const, coordinates: [fix.lon, fix.lat] },
      }));
    if (features.length === 0) return null;
    return {
      type: "FeatureCollection" as const,
      features,
    } satisfies GeoJSON.FeatureCollection<GeoJSON.Point>;
  }, [fixes, visible]);

  useEffect(() => {
    if (!map) return;
    const sourceId = "live-trail-fix-overlay";
    const layerId = "live-trail-fix-overlay-layer";

    const addLayer = () => {
      map.addSource(sourceId, { type: "geojson", data: overlayData! });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
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
