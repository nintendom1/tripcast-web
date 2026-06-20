import type { GeoFix } from "../lib/breadcrumbSampler";
import { distanceMeters } from "../lib/geoUtils";

const METERS_PER_DEG_LAT = 111_320;
const metersPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

const offset = (lat: number, lon: number, dEast: number, dNorth: number) => ({
  lat: lat + dNorth / METERS_PER_DEG_LAT,
  lon: lon + dEast / metersPerDegLon(lat),
});

const BASE_TIME = 1_700_000_000_000;

export type CannedTrace = {
  label: string;
  description: string;
  fixes: GeoFix[];
};

function ujiLoop(): GeoFix[] {
  const cLat = 34.891;
  const cLon = 135.806;
  const radiusM = 7.5;
  const count = 30;
  const out: GeoFix[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * 2 * Math.PI;
    const { lat, lon } = offset(cLat, cLon, radiusM * Math.cos(theta), radiusM * Math.sin(theta));
    out.push({ lat, lon, sampledAt: BASE_TIME + i * 1000, accuracy: 8 });
  }
  return out;
}

function straightLine(): GeoFix[] {
  const startLat = 47.6;
  const startLon = -122.3;
  const speedMps = 1.4;
  const intervalS = 1;
  const durationS = 120;
  const out: GeoFix[] = [];
  for (let i = 0; i <= durationS; i += intervalS) {
    const { lat, lon } = offset(startLat, startLon, speedMps * i, 0);
    out.push({ lat, lon, sampledAt: BASE_TIME + i * 1000, accuracy: 10 });
  }
  return out;
}

function highwayWithTurn(): GeoFix[] {
  const startLat = 37.5;
  const startLon = -122.0;
  const speedMps = 25;
  const intervalS = 1;
  const turnAtS = 15;
  const totalS = 30;
  const out: GeoFix[] = [];
  for (let i = 0; i <= totalS; i += intervalS) {
    const east = i <= turnAtS ? speedMps * i : speedMps * turnAtS;
    const north = i <= turnAtS ? 0 : speedMps * (i - turnAtS);
    const { lat, lon } = offset(startLat, startLon, east, north);
    out.push({ lat, lon, sampledAt: BASE_TIME + i * 1000, accuracy: 12 });
  }
  return out;
}

function stationSCurve(): GeoFix[] {
  const startLat = 35.681;
  const startLon = 139.767;
  const totalS = 90;
  const intervalS = 1;
  const forwardSpeedMps = 1.4;
  const amplitudeM = 6;
  const wavelengthM = 50;
  const out: GeoFix[] = [];
  for (let i = 0; i <= totalS; i += intervalS) {
    const along = forwardSpeedMps * i;
    const lateral = amplitudeM * Math.sin((2 * Math.PI * along) / wavelengthM);
    const { lat, lon } = offset(startLat, startLon, along, lateral);
    out.push({ lat, lon, sampledAt: BASE_TIME + i * 1000, accuracy: 9 });
  }
  return out;
}

function stationaryJitter(): GeoFix[] {
  // Standing still in a poor-GPS spot (think the covered Shinsaibashi arcade):
  // the device reports fixes scattered within a ~12m radius. None move >50m, so
  // the sampler rejects all but the first → a dense red cluster. This is the
  // case from the production screenshots that motivated the densifier work.
  const cLat = 34.6716; // Shinsaibashi-suji, Osaka
  const cLon = 135.5012;
  const radiusM = 8;
  const count = 30;
  const out: GeoFix[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-scatter (no Math.random, so stories/tests are stable).
    const ra = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const tb = Math.sin((i + 1) * 78.233) * 12543.1234;
    const r = (ra - Math.floor(ra)) * radiusM;
    const theta = (tb - Math.floor(tb)) * 2 * Math.PI;
    const { lat, lon } = offset(cLat, cLon, r * Math.cos(theta), r * Math.sin(theta));
    // ~4s cadence matches the debug densifier's poll interval.
    out.push({ lat, lon, sampledAt: BASE_TIME + i * 4000, accuracy: 18 });
  }
  return out;
}

export type TraceSummary = {
  totalMeters: number;
  widthMeters: number;
  heightMeters: number;
  meanSpacingMeters: number;
  fixCount: number;
};

export function summarizeTrace(fixes: GeoFix[]): TraceSummary {
  if (fixes.length === 0) {
    return { totalMeters: 0, widthMeters: 0, heightMeters: 0, meanSpacingMeters: 0, fixCount: 0 };
  }
  let totalMeters = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (i > 0) totalMeters += distanceMeters(fixes[i - 1], f);
    if (f.lat < minLat) minLat = f.lat;
    if (f.lat > maxLat) maxLat = f.lat;
    if (f.lon < minLon) minLon = f.lon;
    if (f.lon > maxLon) maxLon = f.lon;
  }
  const heightMeters = distanceMeters({ lat: minLat, lon: minLon }, { lat: maxLat, lon: minLon });
  const widthMeters = distanceMeters({ lat: minLat, lon: minLon }, { lat: minLat, lon: maxLon });
  const meanSpacingMeters = fixes.length > 1 ? totalMeters / (fixes.length - 1) : 0;
  return { totalMeters, widthMeters, heightMeters, meanSpacingMeters, fixCount: fixes.length };
}

export function formatTraceSummary(s: TraceSummary): string {
  return `Total path: ${s.totalMeters.toFixed(0)}m · Bounding box: ${s.widthMeters.toFixed(0)}m × ${s.heightMeters.toFixed(0)}m · Mean spacing: ${s.meanSpacingMeters.toFixed(1)}m · Fixes: ${s.fixCount}`;
}

export const CANNED_TRACES: Record<string, CannedTrace> = {
  ujiLoop: {
    label: "Uji Loop (~15m)",
    description: "30 fixes tracing a ~15m-diameter loop near Keihan Ujieki station. Motivated Precise mode.",
    fixes: ujiLoop(),
  },
  straightLine: {
    label: "Straight Walk (120s)",
    description: "2 minutes walking due east at ~1.4 m/s. Tests distance + heartbeat triggers.",
    fixes: straightLine(),
  },
  highwayWithTurn: {
    label: "Highway + 90° Turn",
    description: "30 seconds at ~25 m/s with one sharp turn at 15s. Tests turn detection at speed.",
    fixes: highwayWithTurn(),
  },
  stationSCurve: {
    label: "Station S-Curve (90s)",
    description: "Long S-curve through a train station at walking pace. Every emit should be legitimate.",
    fixes: stationSCurve(),
  },
  stationaryJitter: {
    label: "Stationary Jitter (poor GPS)",
    description: "30 fixes scattered within ~12m while standing still in bad GPS. Almost all rejected → the dense red cluster from the production screenshots.",
    fixes: stationaryJitter(),
  },
};
