import React, { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  evaluateBreadcrumbSample,
  DEFAULT_SAMPLER_CONFIG,
  PRECISE_SAMPLER_CONFIG,
  type BreadcrumbSamplerState,
  type GeoFix,
} from "../../lib/breadcrumbSampler";
import { evaluateLegacyBreadcrumbSample } from "../../lib/legacyBreadcrumbSampler";
import type { RecentFix } from "../../lib/pendingFixesBuffer";
import type { SamplerMode } from "../../lib/samplerMode";
import { CANNED_TRACES, summarizeTrace, formatTraceSummary } from "../../stories/breadcrumbTraces";
import { useFixOverlay } from "./useFixOverlay";

function runTrace(mode: SamplerMode, trace: GeoFix[]): RecentFix[] {
  let state: BreadcrumbSamplerState = {};
  return trace.map((fix) => {
    const result =
      mode === "legacy"
        ? evaluateLegacyBreadcrumbSample(state, fix, false)
        : evaluateBreadcrumbSample(
            state,
            fix,
            mode === "precise" ? PRECISE_SAMPLER_CONFIG : DEFAULT_SAMPLER_CONFIG,
            false,
          );
    state = result.nextState;
    return {
      lat: fix.lat,
      lon: fix.lon,
      sampledAt: fix.sampledAt,
      outcome: result.shouldEmit ? "emitted" : "rejected",
    };
  });
}

function fitMapToFixes(map: maplibregl.Map, fixes: GeoFix[]) {
  if (fixes.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const f of fixes) bounds.extend([f.lon, f.lat]);
  map.fitBounds(bounds, { padding: 60, animate: false, maxZoom: 19 });
}

function OverlayPreview({ traceKey, mode }: { traceKey: keyof typeof CANNED_TRACES; mode: SamplerMode }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const trace = CANNED_TRACES[traceKey];
  const recent = useMemo(() => runTrace(mode, trace.fixes), [mode, trace.fixes]);
  const counts = useMemo(
    () => ({
      emitted: recent.filter((f) => f.outcome === "emitted").length,
      rejected: recent.filter((f) => f.outcome === "rejected").length,
    }),
    [recent],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [trace.fixes[0].lon, trace.fixes[0].lat],
      zoom: 18,
    });
    m.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-left");
    m.on("load", () => {
      fitMapToFixes(m, trace.fixes);
      setMap(m);
    });
    return () => { m.remove(); };
  }, [traceKey, trace.fixes]);

  useFixOverlay(map, recent, true);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{trace.label} — {mode}</h2>
      <p style={{ marginBottom: 4, opacity: 0.75, fontSize: 13 }}>
        {formatTraceSummary(summarizeTrace(trace.fixes))}
      </p>
      <p style={{ marginBottom: 8, opacity: 0.75, fontSize: 13 }}>
        Green = emitted ({counts.emitted}) · Red = rejected ({counts.rejected}) · Blue line = fixes connected in time order
      </p>
      <div ref={containerRef} style={{ height: 500, width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
    </div>
  );
}

const meta = {
  title: "Breadcrumbs/Fix Overlay Playback",
  parameters: { layout: "fullscreen" },
  argTypes: {
    traceKey: { control: { type: "select" }, options: Object.keys(CANNED_TRACES) },
    mode: { control: { type: "radio" }, options: ["legacy", "relevant", "precise"] satisfies SamplerMode[] },
  },
} satisfies Meta;

export default meta;

type Args = { traceKey: keyof typeof CANNED_TRACES; mode: SamplerMode };

export const Interactive: StoryObj<Args> = {
  args: { traceKey: "ujiLoop", mode: "precise" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};

export const UjiLoopPrecise: StoryObj<Args> = {
  args: { traceKey: "ujiLoop", mode: "precise" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};

export const StraightLineRelevant: StoryObj<Args> = {
  args: { traceKey: "straightLine", mode: "relevant" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};

export const HighwayRelevant: StoryObj<Args> = {
  args: { traceKey: "highwayWithTurn", mode: "relevant" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};

export const StationSCurvePrecise: StoryObj<Args> = {
  args: { traceKey: "stationSCurve", mode: "precise" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};

export const StationaryJitter: StoryObj<Args> = {
  // `relevant` (50m distance threshold) matches the production sampler semantics
  // that rejected the stationary jitter into a red cluster.
  args: { traceKey: "stationaryJitter", mode: "relevant" },
  render: (args) => <OverlayPreview traceKey={args.traceKey} mode={args.mode} />,
};
