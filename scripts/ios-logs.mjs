import { execFile, spawn } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

// Reads the installed app's Debug Log from an iPhone on cable or the same network, so nobody has to
// copy-paste logs. Read-only toward the phone apart from the relaunch in `--console`.

// Same bundle id as scripts/ios-run.mjs (its `appBundleId` is not exported).
export const DEFAULT_BUNDLE_ID = "com.tripcast.app";
export const WEB_STORAGE_DIR = "Library/WebKit/WebsiteData/Default";
// Only keys under this prefix are ever selected; the same database holds the sign-in token.
export const DEBUG_KEY_PREFIX = "tripcast.debug.";
export const LOG_KEY = `${DEBUG_KEY_PREFIX}logs`;
const DETAILS_LIMIT = 300;
const SQLITE3 = "/usr/bin/sqlite3";

export const HELP = `ios:logs: read the TripCast Debug Log from a connected iPhone.
  npm run ios:logs [-- --errors] [-- --since <minutes>] [-- --grep <text>] [-- --json]
                   [-- --device <id>] [-- --bundle <id>] [-- --console]
Prints one line per entry: time, level, category, src, action, details (cut to ${DETAILS_LIMIT} chars).
  --errors          only warn and error entries
  --since <minutes> only entries from the last N minutes
  --grep <text>     substring match on action, src or the details JSON
  --json            the (filtered) raw array, pretty-printed, nothing else on stdout
  --device <id>     device identifier, UDID or name (needed when several are connected)
  --bundle <id>     app bundle id (default ${DEFAULT_BUNDLE_ID})
  --console         RESTARTS the app and streams its console until Ctrl-C
Needs a development-signed build and a paired device. Exit 1 with a reason on failure.`;

export class LogsError extends Error {}

// ---------------------------------------------------------------- pure helpers

export function parseArgs(argv) {
  const options = { bundle: DEFAULT_BUNDLE_ID };
  const value = (index, flag) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new LogsError(`${flag} needs a value.`);
    return next;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--errors") options.errors = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--console") options.console = true;
    else if (arg === "--device") options.device = value(i++, arg);
    else if (arg === "--bundle") options.bundle = value(i++, arg);
    else if (arg === "--grep") options.grep = value(i++, arg);
    else if (arg === "--since") {
      const minutes = Number(value(i++, arg));
      if (!Number.isFinite(minutes) || minutes <= 0) throw new LogsError("--since needs a positive number of minutes.");
      options.since = minutes;
    } else throw new LogsError(`Unknown argument: ${arg}\n${HELP}`);
  }
  return options;
}

/** Devices from `devicectl list devices --json-output`; `connected` is the tunnel state. */
export function parseDeviceList(json) {
  const devices = json?.result?.devices ?? [];
  return devices.map(device => ({
    id: device.identifier,
    udid: device.hardwareProperties?.udid,
    name: device.deviceProperties?.name ?? "",
    model: device.hardwareProperties?.marketingName ?? "",
    connected: device.connectionProperties?.tunnelState === "connected",
  }));
}

/**
 * Candidate web view databases from `devicectl device info files` output. Rows start with the path
 * (relative to WEB_STORAGE_DIR); only `.../localstorage.sqlite3` and its `-wal` are kept (sqlite
 * rebuilds `-shm`). Returns [{ id, files: [path relative to the app container] }], db first.
 */
export function parseFileListing(text) {
  const origins = new Map();
  for (const line of text.split("\n")) {
    const path = line.trim().split(/\s+/)[0];
    const match = /^(.+)\/localstorage\.sqlite3(-wal)?$/.exec(path ?? "");
    if (!match) continue;
    const origin = origins.get(match[1]) ?? { id: match[1], db: undefined, wal: undefined };
    origin[match[2] ? "wal" : "db"] = `${WEB_STORAGE_DIR}/${path}`;
    origins.set(match[1], origin);
  }
  return [...origins.values()]
    .filter(origin => origin.db)
    .map(origin => ({ id: origin.id, files: [origin.db, origin.wal].filter(Boolean) }));
}

/** SQL for the debug keys only. Refuses any key outside DEBUG_KEY_PREFIX. */
export function debugLogsSql(key = LOG_KEY) {
  if (!key.startsWith(DEBUG_KEY_PREFIX) || key.includes("'")) {
    throw new LogsError(`Refusing to read key outside ${DEBUG_KEY_PREFIX}: ${key}`);
  }
  return `select hex(value) from ItemTable where key='${key}';`;
}

/** `hex(value)` of a UTF-16LE blob, back to the JSON text. */
export function decodeHexUtf16le(hex) {
  return Buffer.from(hex.trim(), "hex").toString("utf16le").replace(/^﻿/, "");
}

/** Entries from sqlite's `hex(value)` output; undefined when the key has no row. */
export function parseLogHex(hex) {
  if (!hex.trim()) return undefined;
  const entries = JSON.parse(decodeHexUtf16le(hex));
  if (!Array.isArray(entries)) throw new LogsError("tripcast.debug.logs is not an array.");
  return entries;
}

export function toMs(ts) {
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") return /^\d+(\.\d+)?$/.test(ts) ? Number(ts) : Date.parse(ts);
  return Number.NaN;
}

export function newestTs(entries) {
  return entries.reduce((max, entry) => {
    const ms = toMs(entry?.ts);
    return Number.isFinite(ms) && ms > max ? ms : max;
  }, -Infinity);
}

/** The origin whose log has the latest entry; ties keep the first. `candidates`: [{ id, entries }]. */
export function pickNewestOrigin(candidates) {
  let best;
  for (const candidate of candidates) {
    if (!best || newestTs(candidate.entries) > newestTs(best.entries)) best = candidate;
  }
  return best;
}

export function filterEntries(entries, { errors, since, grep, nowMs = Date.now() } = {}) {
  return entries.filter(entry => {
    if (errors && entry.level !== "warn" && entry.level !== "error") return false;
    if (since !== undefined && !(toMs(entry.ts) >= nowMs - since * 60_000)) return false;
    if (grep) {
      const haystack = [entry.action, entry.src, JSON.stringify(entry.details ?? null)];
      if (!haystack.some(part => typeof part === "string" && part.includes(grep))) return false;
    }
    return true;
  });
}

const pad = (n, width = 2) => String(n).padStart(width, "0");

export function formatTime(ts) {
  const date = new Date(toMs(ts));
  if (Number.isNaN(date.getTime())) return String(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatLine(entry) {
  let details = entry.details === undefined ? "" : JSON.stringify(entry.details) ?? "";
  if (details.length > DETAILS_LIMIT) details = `${details.slice(0, DETAILS_LIMIT)}…`;
  return [
    formatTime(entry.ts),
    String(entry.level ?? "").padEnd(5),
    entry.category,
    entry.src,
    entry.action,
    details,
  ].filter(part => part !== undefined && part !== "").join(" ").trimEnd();
}

// ---------------------------------------------------------------- process calls

const TIMEOUT_MS = 60_000;
const WAL_COPY_TIMEOUT_MS = 120_000;
const LISTING_RETRY_DELAY_MS = 2_000;

/** A step that ran out of time; aborts the whole run (a locked phone would stall every origin). */
export class TimeoutError extends LogsError {}

/**
 * The one place child processes start: `(file, args, { timeoutMs }) => { status, stdout, stderr }`.
 * Never a shell. A timeout rejects with `code: "ETIMEDOUT"`.
 */
export function defaultRunner(file, args, { timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" }, (error, stdout, stderr) => {
      if (error?.killed) reject(Object.assign(new Error(`${file} timed out`), { code: "ETIMEDOUT" }));
      else if (error && typeof error.code !== "number") reject(error);
      else resolve({ status: error ? error.code : 0, stdout, stderr });
    });
  });
}

function defaultConsole(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("xcrun", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 0));
  });
}

/** Runs one named step with a timeout; turns missing tools and timeouts into actionable errors. */
async function run(runner, file, args, { step, timeoutMs = TIMEOUT_MS } = {}) {
  try {
    return await runner(file, args, { timeoutMs });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new LogsError(file === "xcrun"
        ? "xcrun not found. Install Xcode and its command line tools."
        : `${file} not found.`);
    }
    if (error?.code === "ETIMEDOUT") {
      throw new TimeoutError(`${step ?? file} timed out after ${timeoutMs / 1000} s: locked phone or stalled connection. Unlock the iPhone and retry.`);
    }
    throw error;
  }
}

/** Removes the temp dir on SIGINT/SIGTERM/SIGHUP (exit 130/143/129) and on process exit. */
export function installCleanupHooks(cleanup, proc = process) {
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
    proc.once(signal, () => {
      cleanup();
      proc.exit(code);
    });
  }
  proc.on("exit", cleanup);
}

function describeDevices(devices) {
  return devices.map(d => `  ${d.id}  ${d.name}${d.model ? ` (${d.model})` : ""}`).join("\n");
}

export async function chooseDevice(runner, tempDir, deviceFlag) {
  const jsonPath = join(tempDir, "devices.json");
  const listed = await run(runner, "xcrun", ["devicectl", "list", "devices", "--json-output", jsonPath], { step: "Listing devices" });
  let devices;
  try {
    devices = parseDeviceList(JSON.parse(readFileSync(jsonPath, "utf8")));
  } catch {
    throw new LogsError(`Could not list devices (devicectl exit ${listed.status}). ${(listed.stderr ?? "").trim()}`.trim());
  }
  const connected = devices.filter(device => device.connected);
  if (deviceFlag) {
    const match = connected.find(d => [d.id, d.udid, d.name].includes(deviceFlag));
    if (!match) {
      throw new LogsError(`Device ${deviceFlag} is not connected. Connected devices:\n${describeDevices(connected) || "  (none)"}`);
    }
    return match;
  }
  if (connected.length === 0) {
    throw new LogsError("No iPhone connected. Plug it in (or join the same network), unlock it and trust this Mac.");
  }
  if (connected.length > 1) {
    throw new LogsError(`Several devices are connected; pass --device <id>:\n${describeDevices(connected)}`);
  }
  return connected[0];
}

async function listOrigins(runner, device, bundle, containerArgs, delay) {
  const hint = `Cannot read the ${bundle} container on ${device.name || device.id}: a development-signed build installed on this device is required (npm run ios:run).`;
  let listing;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    listing = await run(runner, "xcrun", [
      "devicectl", "device", "info", "files", ...containerArgs, "--subdirectory", WEB_STORAGE_DIR,
    ], { step: "Listing the app's web view storage" });
    if (listing.status !== 0) throw new LogsError(`${hint}\n${(listing.stderr || listing.stdout || "").trim().split("\n").slice(-3).join("\n")}`);
    const origins = parseFileListing(listing.stdout);
    if (origins.length > 0) return origins;
    if (attempt === 0) await delay(LISTING_RETRY_DELAY_MS); // a cold tunnel can return an empty listing once
  }
  // devicectl prints progress lines on stdout before the rows, so these are mostly progress.
  const head = listing.stdout.split("\n").slice(0, 5).join("\n");
  throw new LogsError(`${hint} No web view storage was found after a retry; open the app once first.\nFirst lines of the listing:\n${head}`);
}

async function readDebugLogs(runner, tempDir, device, bundle, delay) {
  const containerArgs = ["--device", device.id, "--domain-type", "appDataContainer", "--domain-identifier", bundle];
  const origins = await listOrigins(runner, device, bundle, containerArgs, delay);

  // Each origin stands alone: one bad origin must not hide a good one.
  const candidates = [];
  const reasons = [];
  let withoutRow = 0;
  for (const [index, origin] of origins.entries()) {
    const dir = join(tempDir, `origin-${index}`);
    mkdirSync(dir);
    let reason;
    // The app rewrites the log on every entry, so recent entries live in -wal: copy it too.
    for (const source of origin.files) {
      const name = source.split("/").pop();
      const copied = await run(runner, "xcrun", [
        "devicectl", "device", "copy", "from", ...containerArgs, "--source", source, "--destination", join(dir, name),
      ], { step: `Copying ${name}`, timeoutMs: name.endsWith("-wal") ? WAL_COPY_TIMEOUT_MS : TIMEOUT_MS });
      if (copied.status !== 0) {
        reason = `copy of ${name} failed (exit ${copied.status})`;
        break;
      }
    }
    if (!reason) {
      const queried = await run(runner, SQLITE3, [join(dir, "localstorage.sqlite3"), debugLogsSql()], { step: "Reading the database" });
      if (queried.status !== 0) {
        reason = `sqlite3 exited ${queried.status}: ${(queried.stderr ?? "").trim().split("\n")[0]}`;
      } else {
        try {
          const entries = parseLogHex(queried.stdout);
          if (entries) candidates.push({ id: origin.id, entries });
          else withoutRow += 1;
        } catch (error) {
          reason = `unreadable ${LOG_KEY} value (${error.message})`;
        }
      }
    }
    if (reason) reasons.push(`  ${origin.id}: ${reason}`);
  }
  const best = pickNewestOrigin(candidates);
  if (best) return best.entries;
  if (reasons.length === 0) throw new LogsError(`No ${LOG_KEY} key on the device: Debug Logging has recorded nothing yet.`);
  const noRow = withoutRow > 0 ? `\n  ${withoutRow} other origin(s) had no ${LOG_KEY} row.` : "";
  throw new LogsError(`Could not read the Debug Log from any web view storage:\n${reasons.join("\n")}${noRow}`);
}

// ---------------------------------------------------------------- entry point

/** Returns the exit code. `deps` lets tests inject the runner, output and clock. */
export async function main(argv, deps = {}) {
  const {
    runner = defaultRunner,
    runConsole = defaultConsole,
    out = text => process.stdout.write(text),
    err = text => process.stderr.write(text),
    tempRoot = tmpdir(),
    nowMs = Date.now(),
    onInterrupt = () => {},
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = deps;
  let tempDir;
  const cleanup = () => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  };
  try {
    const options = parseArgs(argv);
    if (options.help) {
      out(`${HELP}\n`);
      return 0;
    }
    tempDir = mkdtempSync(join(tempRoot, "tripcast-ios-logs-"));
    onInterrupt(cleanup);
    const device = await chooseDevice(runner, tempDir, options.device);
    if (options.console) {
      err("Warning: --console restarts the app on the device and streams its console until Ctrl-C.\n");
      return await runConsole([
        "devicectl", "device", "process", "launch", "--console", "--terminate-existing", "--device", device.id, options.bundle,
      ]);
    }
    const all = await readDebugLogs(runner, tempDir, device, options.bundle, delay);
    const entries = filterEntries(all, { ...options, nowMs });
    if (options.json) out(`${JSON.stringify(entries, null, 2)}\n`);
    else for (const entry of entries) out(`${formatLine(entry)}\n`);
    if (entries.length === 0) {
      const newest = newestTs(all);
      err(`No entries match the filters. The log holds ${all.length} entries; ${Number.isFinite(newest) ? `the newest is at ${formatTime(newest)}` : "none has a valid time"}.\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof LogsError) err(`${error.message}\n`);
    else if (error?.code === "ENOENT") err(`${error.path ?? "A required tool"} not found.\n`);
    else err(`ios:logs failed: ${error?.message ?? error}\n`);
    return 1;
  } finally {
    cleanup();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.on("error", error => {
    if (error.code === "EPIPE") process.exit(0);
  });
  process.exitCode = await main(process.argv.slice(2), {
    onInterrupt: installCleanupHooks,
  });
}
