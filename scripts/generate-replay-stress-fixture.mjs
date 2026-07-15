#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = {
  count: 100,
  intervalSeconds: 10,
  startLat: 47.5983,
  startLon: -122.3299,
  endLat: 47.6295,
  endLon: -122.3599,
  accuracy: 10,
  output: "replay-stress-fixture.json",
};

function usage() {
  return `Generate a TripCast Bulk Import fixture containing Live Trail breadcrumbs.

Usage:
  npm run fixture:replay -- [options]

Options:
  --count <1-100>              Breadcrumbs to generate (default: 100)
  --interval-seconds <n>       Seconds between breadcrumbs, minimum 5 (default: 10)
  --start-at <ISO timestamp>   Timestamp of the first breadcrumb
                               (default: route ends one minute before now)
  --start-lat <number>         Route start latitude (default: ${DEFAULTS.startLat})
  --start-lon <number>         Route start longitude (default: ${DEFAULTS.startLon})
  --end-lat <number>           Route end latitude (default: ${DEFAULTS.endLat})
  --end-lon <number>           Route end longitude (default: ${DEFAULTS.endLon})
  --accuracy <number>          Accuracy in meters (default: ${DEFAULTS.accuracy})
  --output <path>              Output JSON path (default: ${DEFAULTS.output})
  --force                      Replace an existing output file
  --help                       Show this help
`;
}

function fail(message) {
  console.error(`Error: ${message}\n`);
  console.error(usage());
  process.exit(1);
}

function readArgs(argv) {
  const values = { ...DEFAULTS, force: false, startAt: undefined };
  const numberFlags = new Map([
    ["--count", "count"],
    ["--interval-seconds", "intervalSeconds"],
    ["--start-lat", "startLat"],
    ["--start-lon", "startLon"],
    ["--end-lat", "endLat"],
    ["--end-lon", "endLon"],
    ["--accuracy", "accuracy"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--force") {
      values.force = true;
      continue;
    }
    if (arg === "--start-at" || arg === "--output" || numberFlags.has(arg)) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) fail(`${arg} requires a value.`);
      index += 1;
      if (arg === "--start-at") values.startAt = next;
      else if (arg === "--output") values.output = next;
      else values[numberFlags.get(arg)] = Number(next);
      continue;
    }
    fail(`Unknown option ${arg}.`);
  }

  return values;
}

function validate(options) {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 100) {
    fail("--count must be an integer from 1 through 100 because Bulk Import accepts at most 100 entries.");
  }
  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds < 5) {
    fail("--interval-seconds must be at least 5 so replay does not thin generated breadcrumbs.");
  }
  if (!Number.isFinite(options.accuracy) || options.accuracy < 0) {
    fail("--accuracy must be zero or greater.");
  }
  for (const [name, value, min, max] of [
    ["--start-lat", options.startLat, -90, 90],
    ["--end-lat", options.endLat, -90, 90],
    ["--start-lon", options.startLon, -180, 180],
    ["--end-lon", options.endLon, -180, 180],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max) {
      fail(`${name} must be a finite number from ${min} through ${max}.`);
    }
  }
  if (options.startAt !== undefined && !Number.isFinite(Date.parse(options.startAt))) {
    fail("--start-at must be an ISO timestamp with a time-zone offset, such as 2026-07-15T09:00:00+09:00.");
  }
  if (!options.output.trim()) fail("--output cannot be empty.");
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function buildFixture(options) {
  const intervalMs = options.intervalSeconds * 1_000;
  const routeDurationMs = Math.max(0, options.count - 1) * intervalMs;
  const startAt = options.startAt === undefined
    ? Date.now() - routeDurationMs - 60_000
    : Date.parse(options.startAt);
  const runId = new Date(startAt).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const entries = Array.from({ length: options.count }, (_, index) => {
    const progress = options.count === 1 ? 0 : index / (options.count - 1);
    // A small lateral wave keeps the route visibly organic without random output.
    const wave = Math.sin(progress * Math.PI * 4);
    const lat = options.startLat + (options.endLat - options.startLat) * progress + wave * 0.00018;
    const lon = options.startLon + (options.endLon - options.startLon) * progress - wave * 0.00018;
    return {
      kind: "live_trail_sample",
      ref: `replay-stress:${runId}:${String(index + 1).padStart(3, "0")}`,
      sampledAt: new Date(startAt + index * intervalMs).toISOString(),
      lat: roundCoordinate(lat),
      lon: roundCoordinate(lon),
      accuracy: options.accuracy,
    };
  });

  return { timeZone: "UTC", entries };
}

const options = readArgs(process.argv.slice(2));
validate(options);
const outputPath = path.resolve(process.cwd(), options.output);
if (fs.existsSync(outputPath) && !options.force) {
  fail(`${options.output} already exists. Choose another --output path or pass --force.`);
}

const fixture = buildFixture(options);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

const first = fixture.entries[0];
const last = fixture.entries.at(-1);
console.log(`Wrote ${fixture.entries.length} breadcrumbs to ${outputPath}`);
console.log(`Range: ${first.sampledAt} to ${last.sampledAt}`);
console.log("Import through Options -> Data / Dev -> Bulk Import.");
