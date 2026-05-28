import { useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { Checkpoint } from "../../convex/tripcastApi";
import { LiveTrailPoint } from "./useLiveTrailPath";
import { logMapEvent } from "../../debug/debugLogger";

type UnifiedPoint = {
  lat: number;
  lon: number;
  timestamp: number;
  kind: "checkpoint" | "breadcrumb";
};

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dlat = toRad(b.lat - a.lat);
  const dlon = toRad(b.lon - a.lon);
  const hav =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

// Removes breadcrumb points closer than minMeters to the previous kept point.
// Checkpoints are always kept.
function decimatePoints(points: UnifiedPoint[], minMeters: number): UnifiedPoint[] {
  if (points.length === 0) return points;
  const result: UnifiedPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    if (curr.kind === "checkpoint") {
      result.push(curr);
      continue;
    }
    const prev = result[result.length - 1];
    if (haversineMeters(prev, curr) >= minMeters) {
      result.push(curr);
    }
  }
  return result;
}

// Quantise a value in [0,1] into a small set of discrete opacity buckets to
// reduce the number of features emitted. Range is ~0.45–0.95 so no segment
// ever drops near-invisible regardless of its age.
function bucketOpacity(raw: number): number {
  if (raw <= 0.52) return 0.45;
  if (raw <= 0.68) return 0.62;
  if (raw <= 0.84) return 0.78;
  return 0.95;
}

/**
 * Renders a unified chronological path that interleaves Checkpoints and Live
 * Trail breadcrumbs into a single continuous line.
 *
 * Segment styling (data-driven via feature properties):
 *  - Primary  (width 3.5): consecutive checkpoint → checkpoint segments.
 *  - Secondary (width 2.0): any segment involving a breadcrumb.
 *
 * The line fades for older segments and connects to livePosition when not in
 * replay mode.
 */
export function useTripPath(
  map: maplibregl.Map | null,
  checkpoints: Checkpoint[],
  livePosition: { lat: number; lon: number } | null,
  visible: boolean,
  playheadTime: number | null = null,
  lineColor: string = "#444444",
  liveTrailSamples: LiveTrailPoint[] = [],
  showBreadcrumbs: boolean = false,
) {
  const pathData = useMemo(() => {
    if (!visible) return null;

    const cpPoints: UnifiedPoint[] = checkpoints
      .filter((cp) => cp.lat !== undefined && cp.lon !== undefined)
      .filter((cp) => playheadTime === null || cp.createdAt <= playheadTime)
      .map((cp) => ({
        lat: cp.lat!,
        lon: cp.lon!,
        timestamp: cp.createdAt,
        kind: "checkpoint" as const,
      }));

    const bcPoints: UnifiedPoint[] = showBreadcrumbs
      ? liveTrailSamples
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
          .filter((s) => playheadTime === null || s.sampledAt <= playheadTime)
          .map((s) => ({
            lat: s.lat,
            lon: s.lon,
            timestamp: s.sampledAt,
            kind: "breadcrumb" as const,
          }))
      : [];

    const merged = [...cpPoints, ...bcPoints].sort((a, b) => a.timestamp - b.timestamp);
    const points = decimatePoints(merged, 5);

    // Terminal connection to live GPS when not scrubbing replay.
    // Uses "breadcrumb" kind so the segment is always rendered as thin/secondary,
    // regardless of whether the last trail point is a checkpoint or breadcrumb.
    if (livePosition && playheadTime === null) {
      points.push({
        lat: livePosition.lat,
        lon: livePosition.lon,
        timestamp: Infinity,
        kind: "breadcrumb",
      });
    }

    if (points.length < 2) return null;

    const totalSegments = points.length - 1;
    // The most recent STRENGTH_SEGMENTS segments always render at full opacity so
    // even a brand-new 2- or 3-point path is fully visible.
    const STRENGTH_SEGMENTS = 10;
    const tailLength = Math.max(0, totalSegments - STRENGTH_SEGMENTS);
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    let groupCoords: [number, number][] | null = null;
    let groupIsPrimary = false;
    let groupOpacityBucket = 0;

    for (let i = 0; i < totalSegments; i++) {
      const a = points[i];
      const b = points[i + 1];
      const isPrimary = a.kind === "checkpoint" && b.kind === "checkpoint";
      let opacityBucket: number;
      if (i >= tailLength) {
        opacityBucket = 0.95;
      } else {
        const rawProgress = tailLength > 1 ? i / (tailLength - 1) : 0;
        opacityBucket = bucketOpacity(0.45 + rawProgress * 0.5);
      }

      if (
        groupCoords === null ||
        isPrimary !== groupIsPrimary ||
        opacityBucket !== groupOpacityBucket
      ) {
        if (groupCoords !== null && groupCoords.length >= 2) {
          features.push({
            type: "Feature",
            properties: { opacity: groupOpacityBucket, width: groupIsPrimary ? 3.5 : 2.0 },
            geometry: { type: "LineString", coordinates: groupCoords },
          });
        }
        groupCoords = [[a.lon, a.lat], [b.lon, b.lat]];
        groupIsPrimary = isPrimary;
        groupOpacityBucket = opacityBucket;
      } else {
        groupCoords.push([b.lon, b.lat]);
      }
    }

    if (groupCoords !== null && groupCoords.length >= 2) {
      features.push({
        type: "Feature",
        properties: { opacity: groupOpacityBucket, width: groupIsPrimary ? 3.5 : 2.0 },
        geometry: { type: "LineString", coordinates: groupCoords },
      });
    }

    if (features.length === 0) return null;

    return {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection<GeoJSON.LineString>;
  }, [checkpoints, livePosition, visible, playheadTime, liveTrailSamples, showBreadcrumbs]);

  useEffect(() => {
    if (!map) return;

    const sourceId = "trip-path";
    const layerId = "trip-path-layer";

    const addLayer = () => {
      map.addSource(sourceId, { type: "geojson", data: pathData! });
      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": lineColor,
          "line-width": ["get", "width"],
          "line-dasharray": [2, 2],
          "line-opacity": ["get", "opacity"],
        },
      });
      logMapEvent("map:route-path:re-add", { layerId, lineColor });
    };

    const sync = () => {
      if (!map.isStyleLoaded()) return;
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

    // Re-add when the layer is missing (e.g. setStyle wiped it). "style.load" /
    // "load" fire when the style spec is parsed (MapLibre Style._loaded === true),
    // which is all addSource/addLayer need — so treat those as "ready" WITHOUT the
    // isStyleLoaded() gate. isStyleLoaded() only flips true once tiles/sources also
    // load (≈ the "idle" event ~0.7s later); gating on it was the whole delay.
    const ensureAfterStyle = (e?: { type?: string }) => {
      if (map.getSource(sourceId)) return;
      const styleReady = e?.type === "style.load" || e?.type === "load";
      if ((styleReady || map.isStyleLoaded()) && pathData) addLayer();
    };

    logMapEvent("map:route-path:effect", {
      layerId,
      styleLoaded: map.isStyleLoaded(),
      hasData: !!pathData,
      featureCount: pathData?.features.length ?? 0,
      layerExists: !!map.getSource(sourceId),
      lineColor,
      showBreadcrumbs,
      liveTrailSampleCount: liveTrailSamples.length,
      cpCount: checkpoints.filter((cp) => cp.lat !== undefined && cp.lon !== undefined).length,
      firstSampleTs: liveTrailSamples.length > 0 ? liveTrailSamples[0].sampledAt : null,
      lastSampleTs: liveTrailSamples.length > 0 ? liveTrailSamples[liveTrailSamples.length - 1].sampledAt : null,
    });

    if (map.isStyleLoaded()) {
      sync();
    } else {
      map.once("load", sync);
    }
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
