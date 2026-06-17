import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  evaluateBreadcrumbSample,
  DEFAULT_SAMPLER_CONFIG,
  PRECISE_SAMPLER_CONFIG,
  type BreadcrumbSamplerState,
  type BreadcrumbSampleReason,
  type GeoFix,
} from "./breadcrumbSampler";
import { evaluateLegacyBreadcrumbSample } from "./legacyBreadcrumbSampler";
import { distanceMeters } from "./geoUtils";
import { CANNED_TRACES, summarizeTrace, formatTraceSummary } from "../stories/breadcrumbTraces";
import type { SamplerMode } from "./samplerMode";

type Decision = { emit: boolean; reason?: BreadcrumbSampleReason };

function runMode(mode: SamplerMode, trace: GeoFix[]): Decision[] {
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
    return { emit: result.shouldEmit, reason: result.reason };
  });
}

const MODES: SamplerMode[] = ["legacy", "relevant", "precise"];

function TraceTable({ traceKey }: { traceKey: keyof typeof CANNED_TRACES }) {
  const trace = CANNED_TRACES[traceKey];
  const decisionsByMode: Record<SamplerMode, Decision[]> = {
    legacy: runMode("legacy", trace.fixes),
    relevant: runMode("relevant", trace.fixes),
    precise: runMode("precise", trace.fixes),
  };
  const counts = MODES.map((m) => ({ mode: m, count: decisionsByMode[m].filter((d) => d.emit).length }));

  let lastEmit: GeoFix | null = null;
  const deltas = trace.fixes.map((fix, i) => {
    const dM = lastEmit ? distanceMeters(lastEmit, fix) : null;
    const dS = lastEmit ? (fix.sampledAt - lastEmit.sampledAt) / 1000 : null;
    const dPrev = i > 0 ? distanceMeters(trace.fixes[i - 1], fix) : null;
    if (decisionsByMode.relevant[i].emit) lastEmit = fix;
    return { dM, dS, dPrev };
  });
  const summary = formatTraceSummary(summarizeTrace(trace.fixes));

  return (
    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{trace.label}</h2>
      <p style={{ marginBottom: 8, opacity: 0.7 }}>{trace.description}</p>
      <p style={{ marginBottom: 8, opacity: 0.7 }}>{summary}</p>
      <p style={{ marginBottom: 12, fontWeight: 600 }}>
        Emits — {counts.map((c) => `${c.mode}: ${c.count}`).join(" · ")} of {trace.fixes.length} fixes
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            <th style={cellHead}>#</th>
            <th style={cellHead}>Δm prev</th>
            <th style={cellHead}>Δm (vs rel emit)</th>
            <th style={cellHead}>Δs</th>
            <th style={cellHead}>acc</th>
            {MODES.map((m) => (
              <th key={m} style={cellHead} colSpan={2}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trace.fixes.map((fix, i) => (
            <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
              <td style={cell}>{i}</td>
              <td style={cell}>{deltas[i].dPrev === null ? "—" : deltas[i].dPrev!.toFixed(1)}</td>
              <td style={cell}>{deltas[i].dM === null ? "—" : deltas[i].dM!.toFixed(1)}</td>
              <td style={cell}>{deltas[i].dS === null ? "—" : deltas[i].dS!.toFixed(0)}</td>
              <td style={cell}>{fix.accuracy ?? "—"}</td>
              {MODES.map((m) => {
                const d = decisionsByMode[m][i];
                return (
                  <React.Fragment key={m}>
                    <td style={{ ...cell, color: d.emit ? "#16a34a" : "#9ca3af", fontWeight: 600 }}>
                      {d.emit ? "✓" : "·"}
                    </td>
                    <td style={{ ...cell, opacity: 0.7 }}>{d.reason ?? ""}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React from "react";

const cell: React.CSSProperties = { padding: "2px 6px", textAlign: "left" };
const cellHead: React.CSSProperties = { ...cell, fontWeight: 700, fontSize: 11, textTransform: "uppercase" };

const meta = {
  title: "Breadcrumbs/Sampler Decision Trace",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const UjiLoop: StoryObj<typeof meta> = { render: () => <TraceTable traceKey="ujiLoop" /> };
export const StraightLineWalking: StoryObj<typeof meta> = { render: () => <TraceTable traceKey="straightLine" /> };
export const HighwayWithTurn: StoryObj<typeof meta> = { render: () => <TraceTable traceKey="highwayWithTurn" /> };
export const StationSCurve: StoryObj<typeof meta> = { render: () => <TraceTable traceKey="stationSCurve" /> };
