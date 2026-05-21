const LS_BUTTON_MODE = "tripcast.debug.floating-button-mode";
const LS_SHOW_SOURCE = "tripcast.debug.floating-show-source";
const LS_INCLUDE_FILE = "tripcast.debug.context-include-file";

export type FloatingDebugButtonMode = "log-count" | "compact-context" | "detailed-context";

export type ActiveUiBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ActiveUiContext = {
  sheetName: string;
  label: string;
  view?: string;
  source?: string;
  sourceLabel?: string;
  file?: string;
  openedAt: number;
  bounds?: ActiveUiBounds;
};

export type ActiveUiContextInput = Omit<ActiveUiContext, "openedAt"> & {
  openedAt?: number;
};

export type FloatingDebugSettings = {
  buttonMode: FloatingDebugButtonMode;
  showSource: boolean;
  includeFileInCopies: boolean;
};

type ActiveUiRecord = ActiveUiContext & { ownerId: string };

const subscribers = new Set<() => void>();
const records = new Map<string, ActiveUiRecord>();
const recordOrder: string[] = [];

function notifySubscribers(): void {
  subscribers.forEach((fn) => fn());
}

export function subscribeActiveUiContext(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function normalizeContext(input: ActiveUiContextInput): ActiveUiContext {
  return {
    ...input,
    openedAt: input.openedAt ?? Date.now(),
  };
}

export function getActiveUiContext(): ActiveUiContext | null {
  const activeRecord = records.get(recordOrder[recordOrder.length - 1] ?? "");
  if (!activeRecord) return null;
  const { ownerId: _ownerId, ...context } = activeRecord;
  return context;
}

export function setActiveUiContext(ownerId: string, input: ActiveUiContextInput): ActiveUiContext {
  const context = normalizeContext(input);
  records.set(ownerId, { ...context, ownerId });
  const existingIndex = recordOrder.indexOf(ownerId);
  if (existingIndex !== -1) recordOrder.splice(existingIndex, 1);
  recordOrder.push(ownerId);
  notifySubscribers();
  return context;
}

export function updateActiveUiContext(ownerId: string, patch: Partial<ActiveUiContext>): ActiveUiContext | null {
  const current = records.get(ownerId);
  if (!current) return null;
  records.set(ownerId, { ...current, ...patch });
  notifySubscribers();
  const updated = records.get(ownerId);
  if (!updated) return null;
  const { ownerId: _ownerId, ...context } = updated;
  return context;
}

export function clearActiveUiContext(ownerId: string): ActiveUiContext | null {
  const previousRecord = records.get(ownerId);
  if (!previousRecord) return null;
  records.delete(ownerId);
  const existingIndex = recordOrder.indexOf(ownerId);
  if (existingIndex !== -1) recordOrder.splice(existingIndex, 1);
  const { ownerId: _ownerId, ...previous } = previousRecord;
  notifySubscribers();
  return previous;
}

export function resetActiveUiContextForTests(): void {
  records.clear();
  recordOrder.splice(0, recordOrder.length);
  notifySubscribers();
}

function getStoredButtonMode(): FloatingDebugButtonMode | null {
  const stored = localStorage.getItem(LS_BUTTON_MODE);
  if (
    stored === "log-count" ||
    stored === "compact-context" ||
    stored === "detailed-context"
  ) {
    return stored;
  }
  return null;
}

export function getFloatingDebugSettings(): FloatingDebugSettings {
  return {
    buttonMode: getStoredButtonMode() ?? "detailed-context",
    showSource: localStorage.getItem(LS_SHOW_SOURCE) !== "false",
    includeFileInCopies: localStorage.getItem(LS_INCLUDE_FILE) !== "false",
  };
}

export function setFloatingDebugButtonMode(mode: FloatingDebugButtonMode): void {
  localStorage.setItem(LS_BUTTON_MODE, mode);
  notifySubscribers();
}

export function setFloatingDebugShowSource(show: boolean): void {
  localStorage.setItem(LS_SHOW_SOURCE, show ? "true" : "false");
  notifySubscribers();
}

export function setFloatingDebugIncludeFile(include: boolean): void {
  localStorage.setItem(LS_INCLUDE_FILE, include ? "true" : "false");
  notifySubscribers();
}

function formatOpenedAt(openedAt: number): string {
  return new Date(openedAt).toISOString();
}

function safeRoute(): string {
  if (typeof window === "undefined") return "unknown";
  const params = new URLSearchParams(window.location.search);
  const safeParams: string[] = [];
  params.forEach((value, key) => {
    if (/token|secret|password|auth|apikey|api_key|email|phone|bearer|invite|reset/i.test(key)) return;
    safeParams.push(`${key}=${value}`);
  });
  return `${window.location.pathname || "/"}${safeParams.length ? `?${safeParams.join("&")}` : ""}`;
}

export function formatBounds(bounds: ActiveUiBounds): string {
  return `x=${bounds.x} y=${bounds.y} w=${bounds.w} h=${bounds.h}`;
}

export function formatActiveUiContextForCopy(
  context: ActiveUiContext | null = getActiveUiContext(),
  settings: FloatingDebugSettings = getFloatingDebugSettings(),
): string {
  const viewport = typeof window !== "undefined"
    ? `${window.innerWidth}x${window.innerHeight}`
    : "unknown";
  const route = safeRoute();

  const lines = ["Current TripCast UI Context"];
  if (!context) {
    lines.push("Active sheet: none");
  } else {
    lines.push(`Active sheet: ${context.sheetName}`);
    lines.push(`Label: ${context.label}`);
    if (context.view) lines.push(`View: ${context.view}`);
    lines.push(`Source: ${context.sourceLabel ?? context.source ?? "Unknown"}`);
    if (settings.includeFileInCopies && context.file) lines.push(`File: ${context.file}`);
    lines.push(`Opened at: ${formatOpenedAt(context.openedAt)}`);
    if (context.bounds) lines.push(`Bounds: ${formatBounds(context.bounds)}`);
  }
  lines.push(`Route: ${route || "/"}`);
  lines.push(`Viewport: ${viewport}`);
  return lines.join("\n");
}

export function formatActiveUiContextForSummary(
  context: ActiveUiContext | null = getActiveUiContext(),
  settings: FloatingDebugSettings = getFloatingDebugSettings(),
): string[] {
  if (!context) {
    return ["## Active UI Context", "Active sheet: none", ""];
  }

  const lines = [
    "## Active UI Context",
    `Active sheet: ${context.sheetName}`,
    `Label: ${context.label}`,
  ];
  if (context.view) lines.push(`View: ${context.view}`);
  lines.push(`Source: ${context.sourceLabel ?? context.source ?? "Unknown"}`);
  if (settings.includeFileInCopies && context.file) lines.push(`File: ${context.file}`);
  lines.push(`Opened at: ${formatOpenedAt(context.openedAt)}`);
  if (context.bounds) lines.push(`Bounds: ${formatBounds(context.bounds)}`);
  lines.push("");
  return lines;
}
