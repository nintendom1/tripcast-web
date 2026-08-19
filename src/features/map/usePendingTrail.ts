import { useEffect, useMemo, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { logMapEvent } from "../../debug/debugLogger";

export type LocalTrailPoint = {
  clientSampleId: string;
  lat: number;
  lon: number;
  sampledAt: number;
  status: "pending" | "acknowledged";
};

type SyncState = {
  map: maplibregl.Map | null;
  signature: string | null;
  consecutiveFailures: number;
  circuitOpen: boolean;
};

export function usePendingTrail(
  map: maplibregl.Map | null,
  pending: LocalTrailPoint[],
  latestTransmitted: { lat: number; lon: number } | null,
  visible: boolean,
  theme: "meadow" | "constellation",
): void {
  const syncStateRef = useRef<SyncState>({
    map: null,
    signature: null,
    consecutiveFailures: 0,
    circuitOpen: false,
  });
  const data = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!visible || pending.length === 0) return { type: "FeatureCollection", features: [] };
    const ordered = [...pending].sort((a, b) => a.sampledAt - b.sampledAt);
    const points = latestTransmitted
      ? [{ ...latestTransmitted, clientSampleId: "handoff", sampledAt: -Infinity, status: "acknowledged" as const }, ...ordered]
      : ordered;
    const features: GeoJSON.Feature[] = [];
    if (points.length >= 2) {
      features.push({
        type: "Feature",
        properties: { kind: "line" },
        geometry: { type: "LineString", coordinates: points.map((point) => [point.lon, point.lat]) },
      });
    }
    for (const point of ordered) {
      features.push({
        type: "Feature",
        properties: { kind: "ring" },
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
      });
    }
    return { type: "FeatureCollection", features };
  }, [latestTransmitted, pending, visible]);
  const signature = useMemo(() => JSON.stringify(data), [data]);

  useEffect(() => {
    if (!map) return;
    const sourceId = "pending-live-trail";
    const layerIds = [
      "pending-live-trail-casing",
      "pending-live-trail-line",
      "pending-live-trail-ring-casing",
      "pending-live-trail-rings",
    ] as const;
    const [casingId, lineId, ringCasingId, ringId] = layerIds;
    const color = theme === "constellation" ? "#7dd3fc" : "#2563a6";
    const casing = theme === "constellation" ? "#0b1f3a" : "#ffffff";
    const coordinateCount = data.features.reduce((count, feature) => {
      if (feature.geometry.type === "LineString") return count + feature.geometry.coordinates.length;
      return feature.geometry.type === "Point" ? count + 1 : count;
    }, 0);
    const syncState = syncStateRef.current;
    if (syncState.map !== map) {
      syncState.map = map;
      syncState.signature = null;
      syncState.consecutiveFailures = 0;
      syncState.circuitOpen = false;
    }

    let subscribed = false;
    const unsubscribe = () => {
      if (!subscribed) return;
      subscribed = false;
      map.off("load", ensureAfterStyle);
      map.off("style.load", ensureAfterStyle);
      map.off("styledata", ensureAfterStyle);
      map.off("idle", ensureAfterStyle);
    };
    const openCircuit = () => {
      if (syncState.circuitOpen) return;
      syncState.circuitOpen = true;
      unsubscribe();
      for (const layerId of [...layerIds].reverse()) {
        try { if (map.getLayer(layerId)) map.removeLayer(layerId); } catch { /* overlay is already disabled */ }
      }
      try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch { /* overlay is already disabled */ }
      logMapEvent("map:pending-trail:circuit-open", {
        operation: "disable",
        stage: "circuit-open",
        styleLoaded: map.isStyleLoaded(),
        featureCount: data.features.length,
        coordinateCount,
        consecutiveFailureCount: syncState.consecutiveFailures,
      });
    };
    const attempt = (operation: string, stage: string, run: () => void): boolean => {
      if (syncState.circuitOpen) return false;
      try {
        run();
        return true;
      } catch (error) {
        syncState.consecutiveFailures += 1;
        logMapEvent("map:pending-trail:failure", {
          operation,
          stage,
          errorType: error instanceof Error ? error.name : typeof error,
          styleLoaded: map.isStyleLoaded(),
          featureCount: data.features.length,
          coordinateCount,
          consecutiveFailureCount: syncState.consecutiveFailures,
        });
        if (syncState.consecutiveFailures >= 3) openCircuit();
        return false;
      }
    };
    const markSuccess = () => { syncState.consecutiveFailures = 0; };
    const ensureLayers = () => {
      if (syncState.circuitOpen || data.features.length === 0) return;
      if (!map.getSource(sourceId) && !attempt("addSource", "ensure-source", () => {
        map.addSource(sourceId, { type: "geojson", data });
      })) return;
      const lineFilter: maplibregl.FilterSpecification = ["==", ["get", "kind"], "line"];
      const ringFilter: maplibregl.FilterSpecification = ["==", ["get", "kind"], "ring"];
      const layers: maplibregl.LayerSpecification[] = [
        { id: casingId, type: "line", source: sourceId, filter: lineFilter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": casing, "line-width": 4, "line-dasharray": [0.5, 1.5] } },
        { id: lineId, type: "line", source: sourceId, filter: lineFilter, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": 2, "line-dasharray": [0.5, 1.5] } },
        { id: ringCasingId, type: "circle", source: sourceId, filter: ringFilter, paint: { "circle-radius": 5, "circle-color": casing } },
        { id: ringId, type: "circle", source: sourceId, filter: ringFilter, paint: { "circle-radius": 3.5, "circle-color": casing, "circle-stroke-color": color, "circle-stroke-width": 2 } },
      ];
      for (const layer of layers) {
        if (!map.getLayer(layer.id) && !attempt("addLayer", `ensure-${layer.id}`, () => map.addLayer(layer))) return;
      }
      syncState.signature = signature;
      markSuccess();
    };
    function ensureAfterStyle(event?: { type?: string }) {
      if (
        syncState.circuitOpen ||
        data.features.length === 0 ||
        (map!.getSource(sourceId) && layerIds.every((layerId) => map!.getLayer(layerId)))
      ) return;
      const styleReady = event?.type === "style.load" || event?.type === "load";
      if (styleReady || map!.isStyleLoaded()) ensureLayers();
    }

    if (!syncState.circuitOpen) {
      if (data.features.length === 0) {
        let succeeded = true;
        for (const layerId of [...layerIds].reverse()) {
          if (map.getLayer(layerId)) succeeded = attempt("removeLayer", `remove-${layerId}`, () => map.removeLayer(layerId)) && succeeded;
        }
        if (map.getSource(sourceId)) succeeded = attempt("removeSource", "remove-source", () => map.removeSource(sourceId)) && succeeded;
        if (succeeded) {
          syncState.signature = signature;
          markSuccess();
        }
      } else {
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (!source) {
          ensureLayers();
        } else {
          let succeeded = true;
          if (syncState.signature !== signature) {
            succeeded = attempt("setData", "apply-data", () => source.setData(data));
          }
          const paints: Array<[string, string, string]> = [
            [casingId, "line-color", casing],
            [lineId, "line-color", color],
            [ringCasingId, "circle-color", casing],
            [ringId, "circle-color", casing],
            [ringId, "circle-stroke-color", color],
          ];
          for (const [layerId, property, value] of paints) {
            if (map.getLayer(layerId)) succeeded = attempt("setPaintProperty", `paint-${layerId}`, () => map.setPaintProperty(layerId, property, value)) && succeeded;
          }
          if (succeeded) {
            syncState.signature = signature;
            markSuccess();
          }
        }
      }
    }

    if (!syncState.circuitOpen && data.features.length > 0) {
      map.on("load", ensureAfterStyle);
      map.on("style.load", ensureAfterStyle);
      map.on("styledata", ensureAfterStyle);
      map.on("idle", ensureAfterStyle);
      subscribed = true;
    }
    logMapEvent("map:pending-trail:sync", {
      result: syncState.circuitOpen ? "circuit-open" : "applied",
      pendingCount: pending.length,
      featureCount: data.features.length,
      coordinateCount,
    });
    return unsubscribe;
  }, [data, map, pending.length, signature, theme]);
}
