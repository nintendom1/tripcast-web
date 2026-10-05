import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Feature } from "geojson";
import type { ReplayRoutePreviewPoint } from "../../convex/tripcastApi";
import { useTheme } from "../../providers/ThemeProvider";
import { getMapStyleResolution } from "../map/mapService";
import { Button } from "../../components/ui/button";

function geometry(points: ReplayRoutePreviewPoint[], compact: boolean): FeatureCollection {
  const features: Feature[] = [];
  let line: number[][] = [];
  const flush = () => { if (line.length > 1) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }); line = []; };
  for (const point of points) {
    if (point.breakBefore) flush();
    if (!compact || point.kept) line.push([point.lon, point.lat]);
  }
  flush();
  return { type: "FeatureCollection", features };
}
export default function TrailCompressionMap({ points }: { points: ReplayRoutePreviewPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fitted = useRef(false);
  const parsed = useRef(false);
  const { resolvedMapBase, resolvedTheme } = useTheme();
  const [original, setOriginal] = useState(true);
  const [compact, setCompact] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accent = resolvedTheme === "constellation" ? "#ffd86a" : "#176bba";
  const omittedColor = resolvedTheme === "constellation" ? "#ff6b6b" : "#c81e32";
  const fit = () => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    const bounds = new maplibregl.LngLatBounds();
    points.forEach(p => bounds.extend([p.lon, p.lat]));
    map.fitBounds(bounds, { padding: 35, maxZoom: 16, duration: 0 });
  };
  useEffect(() => {
    if (!container.current) return;
    const style = getMapStyleResolution(resolvedMapBase).styleUrl;
    if (!style) return;
    let map: maplibregl.Map;
    try { map = new maplibregl.Map({ container: container.current, style, center: [0, 0], zoom: 1 }); }
    catch { setError("Map unavailable. Point counts and compression controls remain available."); return; }
    mapRef.current = map;
    fitted.current = false; parsed.current = false;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    map.on("click", "compression-points", event => {
      const p = event.features?.[0]?.properties;
      if (p) setSelected(`${new Date(Number(p.t)).toLocaleString()} · ${p.kept ? "Kept" : "Omitted from replay"}`);
    });
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, [resolvedMapBase]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      parsed.current = true;
      const sources: Record<string, FeatureCollection> = {
        original: geometry(points, false), compact: geometry(points, true),
        points: { type: "FeatureCollection", features: points.map(p => ({ type: "Feature", properties: { kept: p.kept, t: p.t }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) },
      };
      for (const [name, data] of Object.entries(sources)) {
        const id = `compression-${name}`;
        const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(data); else map.addSource(id, { type: "geojson", data });
      }
      if (!map.getLayer("compression-original")) map.addLayer({ id: "compression-original", type: "line", source: "compression-original", paint: { "line-color": "#8a8f98", "line-width": 5, "line-opacity": 0.65 } });
      if (!map.getLayer("compression-compact")) map.addLayer({ id: "compression-compact", type: "line", source: "compression-compact", paint: { "line-color": accent, "line-width": 2 } });
      if (!map.getLayer("compression-points")) map.addLayer({ id: "compression-points", type: "circle", source: "compression-points", paint: { "circle-radius": 4, "circle-color": ["case", ["get", "kept"], accent, "#ffffff"], "circle-opacity": ["case", ["get", "kept"], 1, 0], "circle-stroke-width": ["case", ["get", "kept"], 1, 2.5], "circle-stroke-color": ["case", ["get", "kept"], "#505660", omittedColor] } });
      map.setPaintProperty("compression-compact", "line-color", accent);
      map.setPaintProperty("compression-points", "circle-color", ["case", ["get", "kept"], accent, "#ffffff"]);
      map.setPaintProperty("compression-points", "circle-stroke-color", ["case", ["get", "kept"], "#505660", omittedColor]);
      for (const [name, visible] of [["original", original], ["compact", compact], ["points", showPoints]] as const) map.setLayoutProperty(`compression-${name}`, "visibility", visible ? "visible" : "none");
      if (!fitted.current && points.length) {
        const bounds = new maplibregl.LngLatBounds();
        points.forEach(p => bounds.extend([p.lon, p.lat]));
        map.fitBounds(bounds, { padding: 35, maxZoom: 16, duration: 0 }); fitted.current = true;
      }
    };
    map.on("style.load", update);
    if (parsed.current || map.isStyleLoaded()) update();
    return () => { map.off("style.load", update); };
  }, [points, original, compact, showPoints, accent, omittedColor, resolvedMapBase]);
  return <section className="space-y-2" aria-label="Trail comparison map">
    <div className="flex flex-wrap gap-3 text-sm">
      <label><input type="checkbox" checked={original} onChange={e => setOriginal(e.target.checked)} /> Original (gray)</label>
      <label><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} /> Compact (accent)</label>
      <label><input type="checkbox" checked={showPoints} onChange={e => setShowPoints(e.target.checked)} /> Points</label>
      <Button variant="outline" onClick={fit} disabled={!points.length}>Fit loaded trail</Button>
    </div>
    <div ref={container} className="h-[40dvh] min-h-60 overflow-hidden rounded-lg border" data-trail-compression-map />
    <p className="text-sm">Points outlined red will be omitted from replay. Original GPS is preserved. Select a point for its time.</p>
    {selected ? <p role="status">{selected}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
