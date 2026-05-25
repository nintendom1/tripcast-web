import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogs,
  clearCategoryOverride,
  getCategoryOverrides,
  getConsoleMirror,
  getLogs,
  getLocationRedact,
  getPreset,
  isCategoryEnabled,
  isEnabled,
  log,
  logMapEvent,
  logMapError,
  logNote,
  buildLlmSummary,
  setCategoryOverride,
  setConsoleMirror,
  setEnabled,
  setLocationRedact,
  setPreset,
  subscribe,
} from "./debugLogger";
import { resetActiveUiContextForTests, setActiveUiContext } from "./activeUiContext";

beforeEach(() => {
  localStorage.clear();
  clearLogs();
  resetActiveUiContextForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Preset management
// ---------------------------------------------------------------------------

describe("getPreset / setPreset", () => {
  it("defaults to 'normal' when nothing is stored", () => {
    expect(getPreset()).toBe("normal");
  });

  it("returns the stored preset after setPreset", () => {
    setPreset("verbose");
    expect(getPreset()).toBe("verbose");
  });

  it("persists across calls", () => {
    setPreset("minimal");
    expect(getPreset()).toBe("minimal");
    setPreset("interaction-trace");
    expect(getPreset()).toBe("interaction-trace");
  });
});

// ---------------------------------------------------------------------------
// Category enabled logic
// ---------------------------------------------------------------------------

describe("isCategoryEnabled", () => {
  it("error is always enabled regardless of preset", () => {
    setPreset("minimal");
    expect(isCategoryEnabled("error")).toBe(true);
    setPreset("normal");
    expect(isCategoryEnabled("error")).toBe(true);
  });

  it("minimal preset enables only error", () => {
    setPreset("minimal");
    expect(isCategoryEnabled("ui")).toBe(false);
    expect(isCategoryEnabled("map")).toBe(false);
    expect(isCategoryEnabled("interaction")).toBe(false);
  });

  it("normal preset enables expected categories", () => {
    setPreset("normal");
    expect(isCategoryEnabled("ui")).toBe(true);
    expect(isCategoryEnabled("map")).toBe(true);
    expect(isCategoryEnabled("mutation")).toBe(true);
    expect(isCategoryEnabled("funds")).toBe(true);
    expect(isCategoryEnabled("query")).toBe(true);
    expect(isCategoryEnabled("interaction")).toBe(false);
    expect(isCategoryEnabled("audio")).toBe(false);
    expect(isCategoryEnabled("state")).toBe(false);
  });

  it("verbose preset enables state, audio, performance, debug on top of normal", () => {
    setPreset("verbose");
    expect(isCategoryEnabled("state")).toBe(true);
    expect(isCategoryEnabled("audio")).toBe(true);
    expect(isCategoryEnabled("performance")).toBe(true);
    expect(isCategoryEnabled("debug")).toBe(true);
    expect(isCategoryEnabled("interaction")).toBe(false);
  });

  it("interaction-trace enables interaction on top of verbose", () => {
    setPreset("interaction-trace");
    expect(isCategoryEnabled("interaction")).toBe(true);
    expect(isCategoryEnabled("debug")).toBe(true);
    expect(isCategoryEnabled("state")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Category overrides
// ---------------------------------------------------------------------------

describe("setCategoryOverride / clearCategoryOverride", () => {
  it("override true enables a category that the preset has off", () => {
    setPreset("minimal");
    expect(isCategoryEnabled("map")).toBe(false);
    setCategoryOverride("map", true);
    expect(isCategoryEnabled("map")).toBe(true);
  });

  it("override false disables a category that the preset has on", () => {
    setPreset("normal");
    expect(isCategoryEnabled("ui")).toBe(true);
    setCategoryOverride("ui", false);
    expect(isCategoryEnabled("ui")).toBe(false);
  });

  it("clearCategoryOverride restores preset behaviour", () => {
    setPreset("normal");
    setCategoryOverride("audio", true);
    expect(isCategoryEnabled("audio")).toBe(true);
    clearCategoryOverride("audio");
    expect(isCategoryEnabled("audio")).toBe(false);
  });

  it("getCategoryOverrides returns persisted overrides", () => {
    setCategoryOverride("funds", false);
    setCategoryOverride("state", true);
    const overrides = getCategoryOverrides();
    expect(overrides.funds).toBe(false);
    expect(overrides.state).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// log() — category and preset filtering
// ---------------------------------------------------------------------------

describe("log() filtering", () => {
  beforeEach(() => {
    setEnabled(true);
  });

  it("does not log when disabled", () => {
    setEnabled(false);
    log("info", "Test", "action", "ui");
    expect(getLogs()).toHaveLength(0);
  });

  it("logs when enabled and category is active", () => {
    setPreset("normal");
    log("info", "Test", "action", "ui");
    expect(getLogs()).toHaveLength(1);
  });

  it("does not log when category is inactive for the preset", () => {
    setPreset("minimal");
    log("info", "Test", "action", "ui");
    expect(getLogs()).toHaveLength(0);
  });

  it("logs error category regardless of preset", () => {
    setPreset("minimal");
    log("error", "Test", "something:failed", "error");
    expect(getLogs()).toHaveLength(1);
  });

  it("query category in normal preset only logs errors", () => {
    setPreset("normal");
    log("info", "Test", "query:start", "query");
    expect(getLogs()).toHaveLength(0);
    log("error", "Test", "query:failed", "query");
    expect(getLogs()).toHaveLength(1);
  });

  it("query category in verbose preset logs all levels", () => {
    setPreset("verbose");
    log("info", "Test", "query:start", "query");
    expect(getLogs()).toHaveLength(1);
  });

  it("written entry includes the category field", () => {
    setPreset("normal");
    log("info", "Test", "action", "map", { x: 1 });
    const entry = getLogs()[0];
    expect(entry.category).toBe("map");
    expect(entry.src).toBe("Test");
    expect(entry.action).toBe("action");
  });

  it("logs MapLibre errors through the always-on error category", () => {
    setPreset("minimal");
    logMapError("map:error", { status: 429, url: "/map/tile/example.pbf" });

    expect(getLogs()).toEqual([
      expect.objectContaining({
        src: "MapLibre",
        action: "map:error",
        category: "error",
        details: {
          status: 429,
          url: "/map/tile/example.pbf",
        },
      }),
    ]);
  });

  it("logs MapLibre lifecycle events in the map category", () => {
    setPreset("normal");
    logMapEvent("map:init:start", { styleUrl: "/map/style" });

    expect(getLogs()).toEqual([
      expect.objectContaining({
        src: "MapLibre",
        action: "map:init:start",
        category: "map",
        details: {
          styleUrl: "/map/style",
        },
      }),
    ]);
  });

  it("redacts token-like keys in details (non-disableable)", () => {
    setPreset("normal");
    log("info", "Test", "action", "auth", { sessionToken: "abc123", userId: "u1" });
    const entry = getLogs()[0];
    expect(entry.details?.sessionToken).toBe("[redacted]");
    expect(entry.details?.userId).toBe("u1");
  });

  it("redacts invite and reset keys", () => {
    setPreset("normal");
    log("info", "Test", "action", "auth", { inviteCode: "INV123", resetLink: "https://..." });
    const entry = getLogs()[0];
    expect(entry.details?.inviteCode).toBe("[redacted]");
    expect(entry.details?.resetLink).toBe("[redacted]");
  });
});

// ---------------------------------------------------------------------------
// Browser console mirroring
// ---------------------------------------------------------------------------

describe("console mirroring", () => {
  beforeEach(() => {
    setEnabled(true);
    setPreset("normal");
  });

  it("defaults browser console mirroring on", () => {
    expect(getConsoleMirror()).toBe(true);
  });

  it("mirrors captured logs to the matching browser console level with Tripcast prefix", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    log("info", "TestSrc", "action:mirror", "ui", { x: 1 });

    expect(infoSpy).toHaveBeenCalledWith(
      "[Tripcast] ui TestSrc · action:mirror",
      expect.objectContaining({
        src: "TestSrc",
        action: "action:mirror",
        category: "ui",
        details: { x: 1 },
      }),
    );
  });

  it("does not mirror logs when browser console mirroring is off", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    setConsoleMirror(false);

    log("info", "TestSrc", "action:no-mirror", "ui");

    expect(getLogs()).toHaveLength(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// clearLogs notifies subscribers
// ---------------------------------------------------------------------------

describe("clearLogs() subscriber notification", () => {
  it("notifies subscribers when logs are cleared", () => {
    setEnabled(true);
    setPreset("normal");
    log("info", "Test", "action", "ui");

    const listener = vi.fn();
    const unsub = subscribe(listener);
    clearLogs();

    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// logNote
// ---------------------------------------------------------------------------

describe("logNote()", () => {
  it("adds a user:note entry to the log when enabled", () => {
    setEnabled(true);
    setPreset("verbose"); // "debug" category active
    expect(logNote("hello world")).toBe(true);
    const logs = getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("user:note");
    expect(logs[0].details?.note).toBe("hello world");
    expect(logs[0].category).toBe("debug");
  });

  it("captures manual notes even when the debug category is filtered out", () => {
    setEnabled(true);
    setPreset("minimal");

    expect(logNote("manual checkpoint")).toBe(true);

    expect(getLogs()).toEqual([
      expect.objectContaining({
        src: "user",
        action: "user:note",
        category: "debug",
        details: { note: "manual checkpoint" },
      }),
    ]);
  });

  it("does not add a user:note entry when debug logging is disabled", () => {
    setEnabled(false);

    expect(logNote("hidden checkpoint")).toBe(false);

    expect(getLogs()).toHaveLength(0);
  });

  it("truncates long notes (redact MAX_STR = 200 applies)", () => {
    setEnabled(true);
    setPreset("verbose");
    logNote("x".repeat(600));
    const entry = getLogs()[0];
    // redact() caps strings at MAX_STR (200) with an ellipsis appended
    const note = entry.details?.note as string;
    expect(note.length).toBeLessThanOrEqual(201); // 200 chars + "…"
    expect(note).toMatch(/…$/);
  });
});

// ---------------------------------------------------------------------------
// Browser console API
// ---------------------------------------------------------------------------

describe("window.tripcast.addLog()", () => {
  it("adds a manual note from the browser console helper", () => {
    setEnabled(true);
    setPreset("minimal");

    expect(window.tripcast?.addLog).toBeTypeOf("function");
    expect(window.tripcast?.addLog?.("console checkpoint")).toBe(true);

    expect(getLogs()).toEqual([
      expect.objectContaining({
        src: "user",
        action: "user:note",
        category: "debug",
        details: { note: "console checkpoint" },
      }),
    ]);
  });

  it("ignores non-string console helper calls", () => {
    setEnabled(true);
    const addLog = window.tripcast?.addLog as unknown as (message: unknown) => boolean;

    expect(addLog({ message: "not supported" })).toBe(false);

    expect(getLogs()).toHaveLength(0);
  });
});

describe("window.tripcast log controls", () => {
  it("toggles debug logging from browser console helpers", () => {
    setEnabled(false);

    expect(window.tripcast?.enableLogs?.()).toBe(true);
    expect(isEnabled()).toBe(true);

    expect(window.tripcast?.disableLogs?.()).toBe(true);
    expect(isEnabled()).toBe(false);
  });

  it("toggles browser console mirroring from browser console helpers", () => {
    setConsoleMirror(false);

    expect(window.tripcast?.enableConsoleLogs?.()).toBe(true);
    expect(getConsoleMirror()).toBe(true);

    expect(window.tripcast?.disableConsoleLogs?.()).toBe(true);
    expect(getConsoleMirror()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Location redaction setting
// ---------------------------------------------------------------------------

describe("getLocationRedact / setLocationRedact", () => {
  it("defaults to false", () => {
    expect(getLocationRedact()).toBe(false);
  });

  it("persists the setting", () => {
    setLocationRedact(true);
    expect(getLocationRedact()).toBe(true);
    setLocationRedact(false);
    expect(getLocationRedact()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildLlmSummary
// ---------------------------------------------------------------------------

describe("buildLlmSummary()", () => {
  it("includes session ID and preset in header", () => {
    setEnabled(true);
    setPreset("verbose");
    const summary = buildLlmSummary();
    expect(summary).toMatch(/Preset: verbose/);
    expect(summary).toMatch(/Session:/);
  });

  it("includes category in timeline entries", () => {
    setEnabled(true);
    setPreset("normal");
    log("info", "TestSrc", "my:action", "map");
    const summary = buildLlmSummary();
    expect(summary).toMatch(/\[map/);
    expect(summary).toMatch(/TestSrc/);
  });

  it("redacts location keys when getLocationRedact is true", () => {
    setEnabled(true);
    setPreset("normal");
    log("info", "TestSrc", "camera:move", "map", { lat: 47.6, lon: -122.3 });
    setLocationRedact(true);
    const summary = buildLlmSummary();
    expect(summary).toContain("[location-redacted]");
    expect(summary).not.toMatch(/"lat":47/);
    setLocationRedact(false);
  });

  it("does not redact location keys when getLocationRedact is false", () => {
    setEnabled(true);
    setPreset("normal");
    log("info", "TestSrc", "camera:move", "map", { lat: 47.6, lon: -122.3 });
    setLocationRedact(false);
    const summary = buildLlmSummary();
    expect(summary).not.toContain("[location-redacted]");
  });

  it("includes active UI context in the summary", () => {
    setEnabled(true);
    setPreset("normal");
    setActiveUiContext("journal", {
      sheetName: "JournalSheet",
      label: "Journal",
      view: "list:story",
      sourceLabel: "Dock -> Journal",
      file: "src/features/journal/JournalSheet.tsx",
    });

    const summary = buildLlmSummary();

    expect(summary).toContain("## Active UI Context");
    expect(summary).toContain("Active sheet: JournalSheet");
    expect(summary).toContain("Label: Journal");
    expect(summary).toContain("Source: Dock -> Journal");
  });
});

// ---------------------------------------------------------------------------
// subscribe
// ---------------------------------------------------------------------------

describe("subscribe()", () => {
  it("fires listener on log()", () => {
    setEnabled(true);
    setPreset("normal");
    const listener = vi.fn();
    const unsub = subscribe(listener);
    log("info", "Test", "action", "ui");
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("fires listener on setEnabled()", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("does not fire after unsubscribe", () => {
    setEnabled(true);
    setPreset("normal");
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    log("info", "Test", "action", "ui");
    expect(listener).not.toHaveBeenCalled();
  });
});
