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

function ModePanel({ mode }: { mode: SamplerMode }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const trace = CANNED_TRACES.ujiLoop;
  const recent = useMemo(() => runTrace(mode, trace.fixes), [mode, trace.fixes]);
  const emitCount = recent.filter((f) => f.outcome === "emitted").length;

  useEffect(() => {
    if (!containerRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [trace.fixes[0].lon, trace.fixes[0].lat],
      zoom: 19,
    });
    m.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-left");
    m.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();
      for (const f of trace.fixes) bounds.extend([f.lon, f.lat]);
      m.fitBounds(bounds, { padding: 40, animate: false, maxZoom: 20 });
      setMap(m);
    });
    return () => { m.remove(); };
  }, [trace.fixes]);

  useFixOverlay(map, recent, true);

  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
        <strong style={{ textTransform: "capitalize" }}>{mode}</strong>{" "}
        <span style={{ color: "#6b7280", fontSize: 13 }}>— {emitCount} of {trace.fixes.length} emitted</span>
      </div>
      <div ref={containerRef} style={{ height: 480 }} />
    </div>
  );
}

function UjiRegression() {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Uji Loop Regression</h2>
      <p style={{ marginBottom: 4, opacity: 0.75, fontSize: 13 }}>
        Same ~15m loop trace, fed through all 3 samplers. Green = emitted, red = rejected. Confirms that the Precise
        mode (plus the bearing-bootstrap fix) actually captures the loop that Relevant/Legacy missed.
      </p>
      <p style={{ marginBottom: 12, opacity: 0.75, fontSize: 13 }}>
        {formatTraceSummary(summarizeTrace(CANNED_TRACES.ujiLoop.fixes))}
      </p>
      <div style={{ display: "flex", gap: 8, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <ModePanel mode="legacy" />
        <ModePanel mode="relevant" />
        <ModePanel mode="precise" />
      </div>
    </div>
  );
}

const meta = {
  title: "Breadcrumbs/Uji Loop Regression",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const SideBySide: StoryObj<typeof meta> = { render: () => <UjiRegression /> };
