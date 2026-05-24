import { formatActiveUiContextForSummary } from "./activeUiContext";

const LS_ENABLED = "tripcast.debug.enabled";
const LS_LOG_KEY = "tripcast.debug.logs";
const LS_PRESET_KEY = "tripcast.debug.preset";
const LS_OVERRIDES_KEY = "tripcast.debug.category-overrides";
const LS_LOCATION_REDACT_KEY = "tripcast.debug.redact-location";
const MAX_ENTRIES = 500;
const DROP_BATCH = 100;
const MAX_BYTES = 256 * 1024;

const SESSION_ID = crypto.randomUUID().slice(0, 8);
const SESSION_START = performance.now();
const SESSION_VIEWPORT = typeof window !== "undefined"
  ? { w: window.innerWidth, h: window.innerHeight }
  : { w: 0, h: 0 };

export type DebugLevel = "debug" | "info" | "warn" | "error";

export type DebugCategory =
  | "error" | "ui" | "route" | "auth" | "mutation" | "query"
  | "map" | "interaction" | "form" | "audio" | "state"
  | "funds" | "performance" | "debug";

export type DebugPreset = "minimal" | "normal" | "verbose" | "interaction-trace";

export interface DebugEntry {
  ts: string;
  elapsed: number;
  sid: string;
  level: DebugLevel;
  category: DebugCategory;
  src: string;
  action: string;
  route?: string;
  details?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

const PRESET_CATEGORIES: Record<DebugPreset, Set<DebugCategory>> = {
  minimal: new Set(["error"]),
  normal: new Set(["error", "auth", "ui", "route", "map", "form", "mutation", "funds", "query"]),
  verbose: new Set([
    "error", "auth", "ui", "route", "map", "form", "mutation", "funds", "query",
    "state", "audio", "performance", "debug",
  ]),
  "interaction-trace": new Set([
    "error", "auth", "ui", "route", "map", "form", "mutation", "funds", "query",
    "state", "audio", "performance", "debug", "interaction",
  ]),
};

// Component name → relative file path registry for LLM summary
const componentRegistry = new Map<string, string>();

export function registerComponent(name: string, filePath: string): void {
  if (!componentRegistry.has(name)) {
    componentRegistry.set(name, filePath);
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

// Secrets are always redacted — this regex is not user-configurable.
const REDACT_KEYS = /token|secret|password|auth|apikey|api_key|email|phone|bearer|invite|reset/i;
const LOCATION_KEYS = /^(lat|lon|lngLat|coords|location|position)$/i;
const MAX_STR = 200;
const MAX_DEPTH = 4;
const MAX_ARR = 10;

function redact(value: unknown, depth = 0, redactLocation = false): unknown {
  if (depth > MAX_DEPTH) return "[…]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > MAX_STR ? value.slice(0, MAX_STR) + "…" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const truncated = value.slice(0, MAX_ARR);
    return truncated.map((v) => redact(v, depth + 1, redactLocation));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (redactLocation && LOCATION_KEYS.test(k)) {
      out[k] = "[location-redacted]";
    } else {
      out[k] = redact(v, depth + 1, redactLocation);
    }
  }
  return out;
}

function currentRoute(): string {
  const params = new URLSearchParams(window.location.search);
  const parts: string[] = [];
  params.forEach((v, k) => {
    if (!REDACT_KEYS.test(k)) parts.push(`${k}=${v}`);
  });
  return parts.length ? `?${parts.join("&")}` : "/";
}

// ---------------------------------------------------------------------------
// In-memory log buffer
// ---------------------------------------------------------------------------

let buffer: DebugEntry[] = [];
let loaded = false;

function loadFromStorage(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(LS_LOG_KEY);
    if (raw) buffer = JSON.parse(raw) as DebugEntry[];
  } catch {
    buffer = [];
  }
}

function persist(): void {
  try {
    let json = JSON.stringify(buffer);
    while (json.length > MAX_BYTES && buffer.length > 0) {
      buffer.splice(0, DROP_BATCH);
      json = JSON.stringify(buffer);
    }
    localStorage.setItem(LS_LOG_KEY, json);
  } catch {
    buffer.splice(0, Math.floor(buffer.length / 2));
    try { localStorage.setItem(LS_LOG_KEY, JSON.stringify(buffer)); } catch { /* give up */ }
  }
}

// ---------------------------------------------------------------------------
// Subscriber registry
// ---------------------------------------------------------------------------

const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  subscribers.forEach((fn) => fn());
}

export function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

// ---------------------------------------------------------------------------
// Enabled / preset / category
// ---------------------------------------------------------------------------

export function isEnabled(): boolean {
  return localStorage.getItem(LS_ENABLED) === "true";
}

export function setEnabled(on: boolean): void {
  localStorage.setItem(LS_ENABLED, on ? "true" : "false");
  notifySubscribers();
}

export function getPreset(): DebugPreset {
  const stored = localStorage.getItem(LS_PRESET_KEY);
  if (stored === "minimal" || stored === "normal" || stored === "verbose" || stored === "interaction-trace") {
    return stored;
  }
  return "normal";
}

export function setPreset(p: DebugPreset): void {
  localStorage.setItem(LS_PRESET_KEY, p);
  notifySubscribers();
}

export function getCategoryOverrides(): Partial<Record<DebugCategory, boolean>> {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES_KEY);
    if (raw) return JSON.parse(raw) as Partial<Record<DebugCategory, boolean>>;
  } catch { /* ignore */ }
  return {};
}

export function setCategoryOverride(cat: DebugCategory, enabled: boolean): void {
  const overrides = getCategoryOverrides();
  overrides[cat] = enabled;
  localStorage.setItem(LS_OVERRIDES_KEY, JSON.stringify(overrides));
  notifySubscribers();
}

export function clearCategoryOverride(cat: DebugCategory): void {
  const overrides = getCategoryOverrides();
  delete overrides[cat];
  localStorage.setItem(LS_OVERRIDES_KEY, JSON.stringify(overrides));
  notifySubscribers();
}

export function isCategoryEnabled(cat: DebugCategory): boolean {
  // "error" is always on — never filterable
  if (cat === "error") return true;
  const overrides = getCategoryOverrides();
  if (cat in overrides) return overrides[cat] === true;
  return PRESET_CATEGORIES[getPreset()].has(cat);
}

// ---------------------------------------------------------------------------
// Location redaction (user setting — only applies to exports/copies)
// ---------------------------------------------------------------------------

export function getLocationRedact(): boolean {
  return localStorage.getItem(LS_LOCATION_REDACT_KEY) === "true";
}

export function setLocationRedact(on: boolean): void {
  localStorage.setItem(LS_LOCATION_REDACT_KEY, on ? "true" : "false");
  notifySubscribers();
}

// ---------------------------------------------------------------------------
// Core log function
// ---------------------------------------------------------------------------

export function log(
  level: DebugLevel,
  src: string,
  action: string,
  category: DebugCategory,
  details?: Record<string, unknown>,
  state?: Record<string, unknown>,
): void {
  if (!isEnabled()) return;
  if (!isCategoryEnabled(category)) return;
  // In "normal" preset, query category only logs errors
  if (category === "query" && getPreset() === "normal" && level !== "error") return;
  loadFromStorage();

  const entry: DebugEntry = {
    ts: new Date().toISOString(),
    elapsed: Math.round(performance.now() - SESSION_START),
    sid: SESSION_ID,
    level,
    category,
    src,
    action,
    route: currentRoute(),
    details: details ? (redact(details) as Record<string, unknown>) : undefined,
    state: state ? (redact(state) as Record<string, unknown>) : undefined,
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  persist();
  notifySubscribers();
}

export function logNote(text: string): void {
  log("info", "user", "user:note", "debug", { note: text.slice(0, 500) });
}

export function logMapError(
  action: string,
  details?: Record<string, unknown>,
  state?: Record<string, unknown>,
): void {
  log("error", "MapLibre", action, "error", details, state);
}

export function logMapEvent(
  action: string,
  details?: Record<string, unknown>,
  state?: Record<string, unknown>,
): void {
  log("info", "MapLibre", action, "map", details, state);
}

export function getLogs(): DebugEntry[] {
  loadFromStorage();
  return [...buffer];
}

export function clearLogs(): void {
  buffer = [];
  localStorage.removeItem(LS_LOG_KEY);
  notifySubscribers();
}

export function getSessionId(): string {
  return SESSION_ID;
}

// ---------------------------------------------------------------------------
// LLM / Debug summary builder
// ---------------------------------------------------------------------------

export function buildLlmSummary(): string {
  loadFromStorage();
  const locationRedact = getLocationRedact();
  const entries = locationRedact
    ? buffer.map((e) => ({
        ...e,
        details: e.details ? (redact(e.details, 0, true) as Record<string, unknown>) : undefined,
        state: e.state ? (redact(e.state, 0, true) as Record<string, unknown>) : undefined,
      }))
    : buffer;

  const lines: string[] = [];

  lines.push("# TripCast Debug Session");
  lines.push(`Session: ${SESSION_ID}  |  Captured: ${entries.length} entries  |  Preset: ${getPreset()}  |  Viewport: ${SESSION_VIEWPORT.w}×${SESSION_VIEWPORT.h}  |  Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Component map
  if (componentRegistry.size > 0) {
    lines.push("## Component Map");
    lines.push("| Component | File |");
    lines.push("|-----------|------|");
    const seen = new Set<string>();
    for (const e of entries) {
      if (!seen.has(e.src)) {
        seen.add(e.src);
        const path = componentRegistry.get(e.src) ?? "(unknown)";
        lines.push(`| ${e.src} | \`${path}\` |`);
      }
    }
    lines.push("");
  }

  // Errors & warnings
  const problems = entries.filter((e) => e.level === "warn" || e.level === "error");
  if (problems.length > 0) {
    lines.push("## Errors & Warnings");
    for (const e of problems) {
      lines.push(`- **[${e.level.toUpperCase()}]** ${e.ts.slice(11, 23)} \`${e.src}\` [${e.category}] · ${e.action}${e.details ? " · " + JSON.stringify(e.details) : ""}`);
    }
    lines.push("");
  }

  lines.push(...formatActiveUiContextForSummary());

  // Timeline (last 100)
  lines.push("## Timeline");
  const timeline = entries.slice(-100);
  for (const e of timeline) {
    const detStr = e.details ? " · " + JSON.stringify(e.details) : "";
    lines.push(`${e.ts.slice(11, 23)} ${e.level.padEnd(5)} [${e.category.padEnd(12)}] ${e.src} · ${e.action}${detStr}`);
    if (e.state) {
      lines.push("  ↳ state: " + JSON.stringify(e.state));
    }
  }

  return lines.join("\n");
}
