// @vitest-environment node

import { EventEmitter } from "events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEBUG_KEY_PREFIX,
  LOG_KEY,
  debugLogsSql,
  decodeHexUtf16le,
  filterEntries,
  formatLine,
  installCleanupHooks,
  main,
  parseArgs,
  parseFileListing,
  parseLogHex,
  pickNewestOrigin,
} from "./ios-logs.mjs";

const hexOf = text => Buffer.from(text, "utf16le").toString("hex").toUpperCase();
const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const minutesAgo = minutes => new Date(NOW - minutes * 60_000).toISOString();

const ORIGIN_A = "0fYARt/0fYARt/LocalStorage";
const ORIGIN_B = "Pbbx7I/Pbbx7I/LocalStorage";
const ORIGIN_C = "QqQqQq/QqQqQq/LocalStorage";
const LISTING = [
  "81 files:",
  "Name                         URL Resources                   Size        Modification date",
  "-----------------------      -----------------------------   ---------   -----------------",
  "0fYARt                       Writable, Readable, Directory   96 bytes    8/30/26, 5:45 AM",
  "0fYARt/0fYARt/IndexedDB/x/IndexedDB.sqlite3   Writable, Readable   72 KB   9/11/26, 5:24 PM",
  `${ORIGIN_A}/localstorage.sqlite3       Writable, Readable   532 KB   11/15/26, 5:27 PM`,
  `${ORIGIN_A}/localstorage.sqlite3-shm   Writable, Readable   128 KB   11/15/26, 5:27 PM`,
  `${ORIGIN_A}/localstorage.sqlite3-wal   Writable, Readable   7.3 MB   11/15/26, 5:28 PM`,
  `${ORIGIN_A}/origin                     Writable, Readable   58 bytes 11/15/26, 5:28 PM`,
  `${ORIGIN_B}/localstorage.sqlite3       Writable, Readable   12 KB   5/26/26, 6:38 PM`,
  `${ORIGIN_B}/localstorage.sqlite3-wal   Writable, Readable   0 KB   5/26/26, 6:38 PM`,
  `${ORIGIN_C}/localstorage.sqlite3       Writable, Readable   12 KB   5/26/26, 6:38 PM`,
  `${ORIGIN_C}/localstorage.sqlite3-shm   Writable, Readable   12 KB   5/26/26, 6:38 PM`,
  `${ORIGIN_C}/localstorage.sqlite3-wal   Writable, Readable   12 KB   5/26/26, 6:38 PM`,
].join("\n");

const entry = (overrides = {}) => ({
  ts: minutesAgo(1), elapsed: 1, sid: "s", level: "info", category: "gps", src: "TripMap",
  action: "gps:tick", route: "/", details: { a: 1 }, ...overrides,
});

describe("ios-logs parsing", () => {
  it("lists the three localstorage origins from a devicectl listing", () => {
    const origins = parseFileListing(LISTING);
    expect(origins.map(o => o.id)).toEqual([ORIGIN_A, ORIGIN_B, ORIGIN_C]);
    expect(origins[0].files).toEqual([
      `Library/WebKit/WebsiteData/Default/${ORIGIN_A}/localstorage.sqlite3`,
      `Library/WebKit/WebsiteData/Default/${ORIGIN_A}/localstorage.sqlite3-wal`,
    ]); // -shm is listed on the phone but never copied: sqlite rebuilds it
    expect(origins[1].files).toHaveLength(2);
  });

  it("ignores origins that have only a -wal and no database", () => {
    expect(parseFileListing(`${ORIGIN_A}/localstorage.sqlite3-wal   Writable   1 KB`)).toEqual([]);
  });

  it("decodes hex UTF-16LE including non-ASCII characters", () => {
    const text = JSON.stringify([{ action: "naïve ✈ 東京 😀" }]);
    expect(decodeHexUtf16le(hexOf(text))).toBe(text);
    expect(parseLogHex(`${hexOf(text)}\n`)[0].action).toBe("naïve ✈ 東京 😀");
    expect(parseLogHex("\n")).toBeUndefined();
  });

  it("chooses the origin whose newest entry is latest", () => {
    const old = { id: "old", entries: [entry({ ts: minutesAgo(500) })] };
    const fresh = { id: "fresh", entries: [entry({ ts: minutesAgo(900) }), entry({ ts: minutesAgo(2) })] };
    expect(pickNewestOrigin([old, fresh, { id: "empty", entries: [] }]).id).toBe("fresh");
    expect(pickNewestOrigin([])).toBeUndefined();
  });

  it("rejects unknown flags and bad --since", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--since", "0"])).toThrow(/positive/);
    expect(parseArgs(["--errors", "--since", "30", "--grep", "x"])).toMatchObject({ errors: true, since: 30, grep: "x" });
  });
});

describe("ios-logs filters and format", () => {
  const entries = [
    entry({ level: "info", action: "a:info" }),
    entry({ level: "warn", action: "a:warn" }),
    entry({ level: "error", action: "a:error", src: "NativeLocationManager" }),
    entry({ level: "error", action: "a:old", ts: minutesAgo(120), details: { reason: "needle" } }),
  ];

  it("--errors keeps warn and error only", () => {
    expect(filterEntries(entries, { errors: true }).map(e => e.action)).toEqual(["a:warn", "a:error", "a:old"]);
  });

  it("--since keeps entries from the last N minutes", () => {
    expect(filterEntries(entries, { since: 60, nowMs: NOW }).map(e => e.action)).toEqual(["a:info", "a:warn", "a:error"]);
  });

  it("--grep matches action, src or details", () => {
    expect(filterEntries(entries, { grep: "Native" }).map(e => e.action)).toEqual(["a:error"]);
    expect(filterEntries(entries, { grep: "a:warn" }).map(e => e.action)).toEqual(["a:warn"]);
    expect(filterEntries(entries, { grep: "needle" }).map(e => e.action)).toEqual(["a:old"]);
  });

  it("formats a line and cuts details to 300 characters", () => {
    const line = formatLine(entry({ details: { text: "x".repeat(500) } }));
    expect(line).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} info  gps TripMap gps:tick \{"text":"x+…$/);
    expect(line.split(" gps:tick ")[1]).toHaveLength(301);
    expect(formatLine(entry({ details: undefined }))).toMatch(/gps:tick$/);
  });
});

describe("ios-logs SQL", () => {
  it("only ever names tripcast.debug. keys", () => {
    const sql = debugLogsSql();
    expect(sql).toMatch(/\bwhere key='tripcast\.debug\./);
    const keys = [...sql.matchAll(/'([^']*)'/g)].map(match => match[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key.startsWith(DEBUG_KEY_PREFIX)).toBe(true);
    expect(LOG_KEY.startsWith(DEBUG_KEY_PREFIX)).toBe(true);
  });

  it("refuses other keys", () => {
    expect(() => debugLogsSql("tripcast.session")).toThrow(/Refusing/);
    expect(() => debugLogsSql("tripcast.debug.x' or 1=1 --")).toThrow(/Refusing/);
  });
});

describe("ios-logs main", () => {
  let tempRoot;
  beforeEach(() => { tempRoot = mkdtempSync(join(tmpdir(), "tripcast-ios-logs-test-")); });
  afterEach(() => { rmSync(tempRoot, { recursive: true, force: true }); });

  const device = (id, name, state = "connected") => ({
    identifier: id, hardwareProperties: { udid: `udid-${id}` }, deviceProperties: { name },
    connectionProperties: { tunnelState: state },
  });

  /** Fake devicectl and sqlite3; `logs` maps origin dir -> entries. */
  function fakeRunner({ devices, logs = {}, copyFails = [], sqliteResults = {}, listings }) {
    const calls = [];
    let listCalls = 0;
    const runner = async (file, args, opts) => {
      calls.push([file, ...args]);
      calls.at(-1).opts = opts;
      if (args[0] === "devicectl" && args[1] === "list") {
        writeFileSync(args[args.indexOf("--json-output") + 1], JSON.stringify({ result: { devices } }));
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args[1] === "device" && args[2] === "info") {
        listCalls += 1;
        return { status: 0, stdout: listings ? listings[Math.min(listCalls, listings.length) - 1] : LISTING, stderr: "" };
      }
      if (args[1] === "device" && args[2] === "copy") {
        const source = args[args.indexOf("--source") + 1];
        if (copyFails.some(dir => source.includes(dir))) return { status: 1, stdout: "", stderr: "copy failed" };
        writeFileSync(args[args.indexOf("--destination") + 1], source);
        return { status: 0, stdout: "", stderr: "" };
      }
      if (file === "/usr/bin/sqlite3") {
        const source = readFileSync(args[0], "utf8"); // the fake copy writes its source path
        const forced = Object.entries(sqliteResults).find(([dir]) => source.includes(dir))?.[1];
        if (forced) return forced;
        const entries = Object.entries(logs).find(([dir]) => source.includes(dir))?.[1];
        return { status: 0, stdout: entries ? `${hexOf(JSON.stringify(entries))}\n` : "\n", stderr: "" };
      }
      throw new Error(`unexpected call ${file} ${args.join(" ")}`);
    };
    return { runner, calls };
  }

  function capture(extra = {}) {
    const result = { out: "", err: "" };
    return { result, deps: { out: t => { result.out += t; }, err: t => { result.err += t; }, tempRoot, nowMs: NOW, ...extra } };
  }

  it("prints the newest origin's entries and copies the db and -wal, not -shm", async () => {
    const { runner, calls } = fakeRunner({
      devices: [device("D1", "Phone")],
      logs: {
        [ORIGIN_A]: [entry({ action: "fresh:one", ts: minutesAgo(1) })],
        [ORIGIN_B]: [entry({ action: "stale:one", ts: minutesAgo(5000) })],
      },
    });
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(0);
    expect(result.out).toContain("fresh:one");
    expect(result.out).not.toContain("stale:one");
    const copied = calls.filter(c => c[2] === "device" && c[3] === "copy").map(c => c[c.indexOf("--source") + 1]);
    for (const suffix of ["localstorage.sqlite3", "localstorage.sqlite3-wal"]) {
      expect(copied).toContain(`Library/WebKit/WebsiteData/Default/${ORIGIN_A}/${suffix}`);
    }
    expect(copied.some(path => path.endsWith("-shm"))).toBe(false);
    const walCopy = calls.find(c => c.includes("--source") && c[c.indexOf("--source") + 1].endsWith("-wal"));
    expect(walCopy.opts.timeoutMs).toBe(120_000);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("--json prints only the filtered array on stdout", async () => {
    const { runner } = fakeRunner({
      devices: [device("D1", "Phone")],
      logs: { [ORIGIN_A]: [entry({ level: "warn", action: "w" }), entry({ action: "i" })] },
    });
    const { result, deps } = capture({ runner });
    expect(await main(["--json", "--errors"], deps)).toBe(0);
    expect(JSON.parse(result.out).map(e => e.action)).toEqual(["w"]);
    expect(result.err).toBe("");
  });

  it("removes the temp directory when the runner throws", async () => {
    const runner = async () => { throw new Error("boom"); };
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toContain("boom");
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("removes the temp directory on interrupt cleanup", async () => {
    let cleanup;
    const { runner } = fakeRunner({ devices: [device("D1", "Phone")] });
    const { deps } = capture({ runner, onInterrupt: fn => { cleanup = fn; } });
    await main(["--console"], { ...deps, runConsole: async () => { expect(readdirSync(tempRoot)).toHaveLength(1); cleanup(); expect(readdirSync(tempRoot)).toEqual([]); return 0; } });
    expect(existsSync(tempRoot)).toBe(true);
  });

  it("exits 1 listing the devices when several are connected and no --device", async () => {
    const { runner } = fakeRunner({ devices: [device("D1", "Alpha"), device("D2", "Beta"), device("D3", "Gone", "disconnected")] });
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/--device/);
    expect(result.err).toContain("D1");
    expect(result.err).toContain("Beta");
    expect(result.err).not.toContain("Gone");
    expect(await main(["--device", "D2", "--console"], { ...deps, runConsole: async args => { expect(args).toContain("D2"); return 0; } })).toBe(0);
  });

  it("explains when no device is connected", async () => {
    const { runner } = fakeRunner({ devices: [device("D1", "Phone", "disconnected")] });
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/No iPhone connected/);
  });

  it("says Debug Logging recorded nothing when no origin has the key", async () => {
    const { runner } = fakeRunner({ devices: [device("D1", "Phone")], logs: {} });
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/recorded nothing/);
  });

  it("asks for a development-signed build when the container is unreadable", async () => {
    const base = fakeRunner({ devices: [device("D1", "Phone")] }).runner;
    const runner = async (file, args) => (args[1] === "device" && args[2] === "info"
      ? { status: 1, stdout: "", stderr: "container not found" } : base(file, args));
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/development-signed build/);
  });

  it("reports a missing xcrun", async () => {
    const runner = async () => { throw Object.assign(new Error("spawn xcrun ENOENT"), { code: "ENOENT" }); };
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/xcrun not found/);
  });

  it("--console warns about the restart then launches with the bundle id", async () => {
    const { runner } = fakeRunner({ devices: [device("D1", "Phone")] });
    let launched;
    const { result, deps } = capture({ runner, runConsole: async args => { launched = args; return 0; } });
    expect(await main(["--console"], deps)).toBe(0);
    expect(result.err).toMatch(/restarts the app/);
    expect(launched).toEqual([
      "devicectl", "device", "process", "launch", "--console", "--terminate-existing", "--device", "D1", "com.tripcast.app",
    ]);
  });

  const GOOD = [entry({ action: "good:one" })];

  it("a failing, a sqlite-failing and a malformed origin do not hide a good origin", async () => {
    const { runner } = fakeRunner({
      devices: [device("D1", "Phone")],
      copyFails: [ORIGIN_A],
      sqliteResults: {
        [ORIGIN_B]: { status: 11, stdout: "", stderr: "database disk image is malformed" },
        [ORIGIN_C]: { status: 0, stdout: `${hexOf("{not json")}\n`, stderr: "" },
      },
    });
    // origin A fails to copy, B exits 11, C is malformed: all fail, so reasons are printed.
    const failing = capture({ runner });
    expect(await main([], failing.deps)).toBe(1);
    expect(failing.result.err).toMatch(/Could not read the Debug Log from any/);
    expect(failing.result.err).toContain(`${ORIGIN_A}: copy of localstorage.sqlite3 failed`);
    expect(failing.result.err).toContain("sqlite3 exited 11: database disk image is malformed");
    expect(failing.result.err).toContain("unreadable tripcast.debug.logs value");
    expect(failing.result.err).not.toMatch(/recorded nothing/);

    const mixed = fakeRunner({
      devices: [device("D1", "Phone")],
      copyFails: [ORIGIN_A],
      logs: { [ORIGIN_B]: GOOD },
      sqliteResults: { [ORIGIN_C]: { status: 0, stdout: `${hexOf("{not json")}\n`, stderr: "" } },
    });
    const ok = capture({ runner: mixed.runner });
    expect(await main([], ok.deps)).toBe(0);
    expect(ok.result.out).toContain("good:one");
  });

  it("retries an empty listing once without sleeping, then shows the listing lines", async () => {
    const delays = [];
    const progress = "Acquired tunnel connection to device.\nEnabling developer disk image services.\nAcquired usage assertion.\n0 files:\nName\nsixth line";
    const empty = fakeRunner({ devices: [device("D1", "Phone")], listings: [progress, progress] });
    const failed = capture({ runner: empty.runner, delay: async ms => { delays.push(ms); } });
    expect(await main([], failed.deps)).toBe(1);
    expect(delays).toEqual([2000]);
    expect(empty.calls.filter(c => c[2] === "device" && c[3] === "info")).toHaveLength(2);
    expect(failed.result.err).toContain("Acquired tunnel connection to device.");
    expect(failed.result.err).toContain("Name");
    expect(failed.result.err).not.toContain("sixth line");

    const recovers = fakeRunner({ devices: [device("D1", "Phone")], listings: [progress, LISTING], logs: { [ORIGIN_A]: GOOD } });
    const ok = capture({ runner: recovers.runner, delay: async () => {} });
    expect(await main([], ok.deps)).toBe(0);
    expect(ok.result.out).toContain("good:one");
  });

  it("names the step when a call times out", async () => {
    const base = fakeRunner({ devices: [device("D1", "Phone")], logs: { [ORIGIN_A]: GOOD } }).runner;
    const runner = async (file, args, opts) => {
      if (args[2] === "copy") throw Object.assign(new Error("slow"), { code: "ETIMEDOUT" });
      return base(file, args, opts);
    };
    const { result, deps } = capture({ runner });
    expect(await main([], deps)).toBe(1);
    expect(result.err).toMatch(/Copying localstorage\.sqlite3 timed out after 60 s: locked phone or stalled connection/);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it("writes a stderr line when the filters leave nothing; --json still prints []", async () => {
    const { runner } = fakeRunner({ devices: [device("D1", "Phone")], logs: { [ORIGIN_A]: [entry({ ts: minutesAgo(4) }), entry({ ts: minutesAgo(9) })] } });
    const text = capture({ runner });
    expect(await main(["--grep", "nomatch"], text.deps)).toBe(0);
    expect(text.result.out).toBe("");
    expect(text.result.err).toMatch(/No entries match the filters\. The log holds 2 entries; the newest is at \d{4}-/);
    const json = capture({ runner });
    expect(await main(["--json", "--grep", "nomatch"], json.deps)).toBe(0);
    expect(JSON.parse(json.result.out)).toEqual([]);
  });

  it("SIGTERM, SIGHUP, SIGINT and exit remove the temp directory with the conventional code", async () => {
    const observed = [];
    for (const [signal, code] of [["SIGTERM", 143], ["SIGHUP", 129], ["SIGINT", 130], ["exit", undefined]]) {
      const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const { runner } = fakeRunner({ devices: [device("D1", "Phone")] });
      const { deps } = capture({ runner });
      const seen = { signal };
      // Assertions here would be swallowed by main's catch, so record and assert afterwards.
      await main(["--console"], {
        ...deps,
        onInterrupt: cleanup => installCleanupHooks(cleanup, proc),
        runConsole: async () => {
          seen.before = readdirSync(tempRoot).length;
          proc.emit(signal);
          seen.after = readdirSync(tempRoot).length;
          seen.exitCode = proc.exit.mock.calls[0]?.[0];
          return 0;
        },
      });
      observed.push({ ...seen, expectedCode: code });
    }
    for (const seen of observed) {
      expect(seen, seen.signal).toMatchObject({ before: 1, after: 0, exitCode: seen.expectedCode });
    }
  });
});
