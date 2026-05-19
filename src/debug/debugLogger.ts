const LS_ENABLED = "tripcast.debug.enabled";
const LS_LOG_KEY = "tripcast.debug.logs";
const MAX_ENTRIES = 500;
const DROP_BATCH = 100;
const MAX_BYTES = 256 * 1024;

const SESSION_ID = crypto.randomUUID().slice(0, 8);
const SESSION_START = performance.now();

export type DebugLevel = "debug" | "info" | "warn" | "error";

export interface DebugEntry {
  ts: string;
  elapsed: number;
  sid: string;
  level: DebugLevel;
  src: string;
  action: string;
  route?: string;
  details?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

// Component name → relative file path registry for LLM summary
const componentRegistry = new Map<string, string>();

export function registerComponent(name: string, filePath: string): void {
  if (!componentRegistry.has(name)) {
    componentRegistry.set(name, filePath);
  }
}

// Redaction
const REDACT_KEYS = /token|secret|password|auth|apikey|api_key|email|phone|bearer/i;
const MAX_STR = 200;
const MAX_DEPTH = 4;
const MAX_ARR = 10;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[…]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > MAX_STR ? value.slice(0, MAX_STR) + "…" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const truncated = value.slice(0, MAX_ARR);
    return truncated.map((v) => redact(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
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

// In-memory log buffer (source of truth during session; synced to localStorage)
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
    // quota exceeded — drop half and try once more
    buffer.splice(0, Math.floor(buffer.length / 2));
    try { localStorage.setItem(LS_LOG_KEY, JSON.stringify(buffer)); } catch { /* give up */ }
  }
}

export function isEnabled(): boolean {
  return localStorage.getItem(LS_ENABLED) === "true";
}

export function setEnabled(on: boolean): void {
  localStorage.setItem(LS_ENABLED, on ? "true" : "false");
}

export function log(
  level: DebugLevel,
  src: string,
  action: string,
  details?: Record<string, unknown>,
  state?: Record<string, unknown>,
): void {
  if (!isEnabled()) return;
  loadFromStorage();

  const entry: DebugEntry = {
    ts: new Date().toISOString(),
    elapsed: Math.round(performance.now() - SESSION_START),
    sid: SESSION_ID,
    level,
    src,
    action,
    route: currentRoute(),
    details: details ? (redact(details) as Record<string, unknown>) : undefined,
    state: state ? (redact(state) as Record<string, unknown>) : undefined,
  };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  persist();
}

export function getLogs(): DebugEntry[] {
  loadFromStorage();
  return [...buffer];
}

export function clearLogs(): void {
  buffer = [];
  localStorage.removeItem(LS_LOG_KEY);
}

export function getSessionId(): string {
  return SESSION_ID;
}

// LLM summary builder
export function buildLlmSummary(): string {
  loadFromStorage();
  const entries = buffer;

  const lines: string[] = [];

  lines.push("# TripCast Debug Session");
  lines.push(`Session: ${SESSION_ID}  |  Captured: ${entries.length} entries  |  Generated: ${new Date().toISOString()}`);
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
      lines.push(`- **[${e.level.toUpperCase()}]** +${e.elapsed}ms \`${e.src}\` · ${e.action}${e.details ? " · " + JSON.stringify(e.details) : ""}`);
    }
    lines.push("");
  }

  // Timeline (last 100)
  lines.push("## Timeline");
  const timeline = entries.slice(-100);
  for (const e of timeline) {
    const detStr = e.details ? " · " + JSON.stringify(e.details) : "";
    lines.push(`+${e.elapsed}ms ${e.level.padEnd(5)} ${e.src} · ${e.action}${detStr}`);
    if (e.state) {
      lines.push("  ↳ state: " + JSON.stringify(e.state));
    }
  }

  return lines.join("\n");
}
