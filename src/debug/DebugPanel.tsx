import { useState, useCallback, useEffect, useRef } from "react";
import {
  isEnabled,
  setEnabled,
  getLogs,
  clearLogs,
  buildLlmSummary,
  getSessionId,
  getPreset,
  setPreset,
  isCategoryEnabled,
  setCategoryOverride,
  clearCategoryOverride,
  getCategoryOverrides,
  getLocationRedact,
  setLocationRedact,
  getConsoleMirror,
  setConsoleMirror,
  getCenteringCalibration,
  setCenteringCalibration,
  subscribe,
  log as rawLog,
  type DebugEntry,
  type DebugCategory,
  type DebugPreset,
} from "./debugLogger";
import {
  formatActiveUiContextForCopy,
  getFloatingDebugSettings,
  setFloatingDebugButtonMode,
  setFloatingDebugIncludeFile,
  setFloatingDebugShowSource,
  subscribeActiveUiContext,
  type FloatingDebugButtonMode,
} from "./activeUiContext";
import { TERMS } from "../copy/terminology";

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy failed");
    }
  } finally {
    document.body.removeChild(ta);
  }
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Entry display
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<DebugEntry["level"], string> = {
  debug: "text-[var(--ink-3)]",
  info:  "text-[var(--ink-2)]",
  warn:  "text-amber-600",
  error: "text-rose-600",
};

const CATEGORY_COLORS: Partial<Record<DebugCategory, string>> = {
  error:       "bg-rose-100 text-rose-700",
  map:         "bg-sky-100 text-sky-700",
  ui:          "bg-violet-100 text-violet-700",
  interaction: "bg-orange-100 text-orange-700",
  mutation:    "bg-emerald-100 text-emerald-700",
  query:       "bg-teal-100 text-teal-700",
  auth:        "bg-yellow-100 text-yellow-700",
  form:        "bg-pink-100 text-pink-700",
  audio:       "bg-purple-100 text-purple-700",
  state:       "bg-indigo-100 text-indigo-700",
  funds:       "bg-lime-100 text-lime-700",
  performance: "bg-cyan-100 text-cyan-700",
  debug:       "bg-gray-100 text-gray-600",
  route:       "bg-blue-100 text-blue-700",
};

function CategoryBadge({ category }: { category: DebugCategory }) {
  const cls = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block rounded px-1 py-0 text-[9px] font-bold uppercase leading-4 ${cls}`}>
      {category}
    </span>
  );
}

function EntryRow({ entry }: { entry: DebugEntry }) {
  const detStr = entry.details ? " · " + JSON.stringify(entry.details) : "";
  const levelCls = LEVEL_COLORS[entry.level];

  return (
    <li className="border-b border-[var(--line-soft)] py-1.5 last:border-0">
      <p className={`font-[var(--font-mono)] text-[11px] leading-snug ${levelCls}`}>
        <span className="text-[var(--ink-3)]">{entry.ts.slice(11, 23)}</span>
        {" "}
        <CategoryBadge category={entry.category} />
        {" "}
        <span className="font-semibold">{entry.src}</span>
        {" · "}
        {entry.action}
        {detStr}
      </p>
      {entry.state ? (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--ink-3)] pl-3">
          ↳ {JSON.stringify(entry.state)}
        </p>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Category override toggles
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Array<{ cat: DebugCategory; label: string }> = [
  { cat: "error",       label: "Errors" },
  { cat: "ui",          label: "UI" },
  { cat: "auth",        label: "Auth" },
  { cat: "mutation",    label: "Mutations" },
  { cat: "query",       label: "Queries" },
  { cat: "map",         label: "Map" },
  { cat: "interaction", label: "Clicks/Taps" },
  { cat: "form",        label: "Forms" },
  { cat: "audio",       label: "Audio" },
  { cat: "state",       label: "State" },
  { cat: "funds",       label: "Funds" },
  { cat: "performance", label: "Performance" },
  { cat: "debug",       label: "Debug" },
  { cat: "route",       label: "Route" },
];

const PRESET_LABELS: Array<{ preset: DebugPreset; label: string }> = [
  { preset: "minimal",           label: "Minimal" },
  { preset: "normal",            label: "Normal" },
  { preset: "verbose",           label: "Verbose" },
  { preset: "interaction-trace", label: "Trace" },
];

const BUTTON_MODE_LABELS: Array<{ mode: FloatingDebugButtonMode; label: string }> = [
  { mode: "log-count", label: "Count" },
  { mode: "compact-context", label: "Compact" },
  { mode: "detailed-context", label: "Detailed" },
];

function CategoryOverrides({ disabled, onRefresh }: { disabled: boolean; onRefresh: () => void }) {
  const [, forceRender] = useState(0);

  function handlePresetClick(p: DebugPreset) {
    if (disabled) return;
    setPreset(p);
    // clear all overrides when switching preset so the preset takes effect cleanly
    const overrides = getCategoryOverrides();
    for (const cat of Object.keys(overrides) as DebugCategory[]) {
      clearCategoryOverride(cat);
    }
    forceRender((n) => n + 1);
    onRefresh();
  }

  function handleCategoryToggle(cat: DebugCategory, checked: boolean) {
    if (disabled) return;
    setCategoryOverride(cat, checked);
    forceRender((n) => n + 1);
    onRefresh();
  }

  const currentPreset = getPreset();

  return (
    <div
      className={`rounded-xl bg-[var(--bg-card)] px-4 py-3 grid gap-3 ${disabled ? "opacity-60" : ""}`}
      aria-disabled={disabled}
    >
      {/* Preset selector */}
      <div>
        <p className="text-xs font-semibold text-[var(--ink-2)] mb-1.5">Verbosity Preset</p>
        <div className="flex gap-1 flex-wrap">
          {PRESET_LABELS.map(({ preset, label }) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => handlePresetClick(preset)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                currentPreset === preset
                  ? "bg-[var(--flag)] text-[var(--ink-on-dark)]"
                  : "bg-[var(--bg-surface)] text-[var(--ink-2)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-category overrides */}
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-[var(--ink-2)] select-none">
          Category overrides
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {CATEGORY_LABELS.map(({ cat, label }) => {
            const isAlwaysOn = cat === "error";
            const checked = isCategoryEnabled(cat);
            return (
              <label
                key={cat}
                className={`flex items-center gap-1.5 text-[11px] ${isAlwaysOn ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || isAlwaysOn}
                  onChange={(e) => handleCategoryToggle(cat, e.target.checked)}
                  className="h-3 w-3 rounded"
                />
                {label}
              </label>
            );
          })}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function DebugPanel({ onBack }: { onBack: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [consoleMirror, setConsoleMirrorState] = useState(getConsoleMirror);
  const [locationRedact, setLocationRedactState] = useState(getLocationRedact);
  const [centeringCalibration, setCenteringCalibrationState] = useState(getCenteringCalibration);
  const [floatingSettings, setFloatingSettings] = useState(getFloatingDebugSettings);
  const [logs, setLogs] = useState<DebugEntry[]>(() => getLogs().slice(-50).reverse());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncDebugState = useCallback(() => {
    setEnabledState(isEnabled());
    setConsoleMirrorState(getConsoleMirror());
    setLocationRedactState(getLocationRedact());
    setCenteringCalibrationState(getCenteringCalibration());
    setLogs(getLogs().slice(-50).reverse());
  }, []);

  // Auto-refresh when debug settings or entries change, including console commands.
  useEffect(() => {
    return subscribe(syncDebugState);
  }, [syncDebugState]);

  useEffect(() => {
    return subscribeActiveUiContext(() => {
      setFloatingSettings(getFloatingDebugSettings());
    });
  }, []);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current !== null) {
        clearTimeout(copyStatusTimerRef.current);
      }
    };
  }, []);

  function clearCopyStatusTimer() {
    if (copyStatusTimerRef.current !== null) {
      clearTimeout(copyStatusTimerRef.current);
      copyStatusTimerRef.current = null;
    }
  }

  function showCopyStatus(message: string) {
    clearCopyStatusTimer();
    setCopyStatus(message);
    copyStatusTimerRef.current = setTimeout(() => {
      setCopyStatus(null);
      copyStatusTimerRef.current = null;
    }, 3000);
  }

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setEnabledState(next);
  }

  function handleConsoleMirrorToggle() {
    if (!enabled) return;
    const next = !consoleMirror;
    setConsoleMirror(next);
    setConsoleMirrorState(next);
  }

  function handleLocationRedactToggle() {
    if (!enabled) return;
    const next = !locationRedact;
    setLocationRedact(next);
    setLocationRedactState(next);
  }

  function handleCenteringCalibrationToggle() {
    if (!enabled) return;
    const next = !centeringCalibration;
    setCenteringCalibration(next);
    setCenteringCalibrationState(next);
  }

  function handleButtonMode(mode: FloatingDebugButtonMode) {
    if (!enabled) return;
    setFloatingDebugButtonMode(mode);
    setFloatingSettings(getFloatingDebugSettings());
    rawLog("info", "DebugPanel", "debug:floating-context-setting:update", "debug", {
      setting: "buttonMode",
      value: mode,
    });
  }

  function handleShowSourceToggle() {
    if (!enabled) return;
    const next = !floatingSettings.showSource;
    setFloatingDebugShowSource(next);
    setFloatingSettings(getFloatingDebugSettings());
    rawLog("info", "DebugPanel", "debug:floating-context-setting:update", "debug", {
      setting: "showSource",
      enabled: next,
    });
  }

  function handleIncludeFileToggle() {
    if (!enabled) return;
    const next = !floatingSettings.includeFileInCopies;
    setFloatingDebugIncludeFile(next);
    setFloatingSettings(getFloatingDebugSettings());
    rawLog("info", "DebugPanel", "debug:floating-context-setting:update", "debug", {
      setting: "includeFileInCopies",
      enabled: next,
    });
  }

  function handleClear() {
    if (!enabled) return;
    clearLogs();
    setLogs([]);
    clearCopyStatusTimer();
    setCopyStatus(null);
  }

  async function handleCopyJson() {
    if (!enabled) return;
    const all = getLogs();
    try {
      await copyToClipboard(JSON.stringify(all, null, 2));
      showCopyStatus("Copied JSON!");
    } catch {
      downloadJson(`tripcast-debug-${getSessionId()}.json`, all);
      showCopyStatus("Downloaded JSON (clipboard unavailable)");
    }
  }

  function handleDownloadJson() {
    if (!enabled) return;
    downloadJson(`tripcast-debug-${getSessionId()}.json`, getLogs());
  }

  async function handleCopyDebugSummary() {
    if (!enabled) return;
    const summary = buildLlmSummary();
    try {
      await copyToClipboard(summary);
      showCopyStatus("Copied debug summary!");
    } catch {
      downloadJson(`tripcast-debug-summary-${getSessionId()}.md`, summary);
      showCopyStatus("Downloaded summary (clipboard unavailable)");
    }
  }

  async function handleCopyCurrentContext() {
    if (!enabled) return;
    const context = formatActiveUiContextForCopy();
    rawLog("info", "DebugPanel", "debug:context:copy", "debug", {
      includeFile: floatingSettings.includeFileInCopies,
    });
    try {
      await copyToClipboard(context);
      showCopyStatus("Copied current context!");
    } catch {
      downloadJson(`tripcast-debug-context-${getSessionId()}.md`, context);
      showCopyStatus("Downloaded context (clipboard unavailable)");
    }
  }

  const allLogs = getLogs();

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-6">
      {/* Back header */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[var(--ink-2)] hover:text-[var(--ink-1)]"
          aria-label="Back to options"
        >
          ← Back
        </button>
        <span className="flex-1 font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">
          {TERMS.debugLog}
        </span>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between rounded-xl bg-[var(--bg-card)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink-1)]">Debug Logging</p>
          <p className="text-xs text-[var(--ink-3)]">Logs stay local in your browser</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Debug logging"
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Browser console mirror toggle */}
      <div className="grid gap-2 rounded-xl bg-[var(--bg-card)] px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[var(--ink-2)]">Browser console logs</p>
            <p className="text-[10px] text-[var(--ink-3)]">Prefix mirrored entries with [Tripcast]</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={consoleMirror}
            aria-label="Browser console logs"
            disabled={!enabled}
            onClick={handleConsoleMirrorToggle}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              consoleMirror ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                consoleMirror ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <div className="grid gap-1 rounded-lg bg-[var(--bg-surface)] p-2 font-[var(--font-mono)] text-[10px] leading-4 text-[var(--ink-2)]">
          <code>tripcast.addLog("Checkpoint")</code>
          <code>tripcast.enableLogs() / tripcast.disableLogs()</code>
          <code>tripcast.enableConsoleLogs() / tripcast.disableConsoleLogs()</code>
        </div>
      </div>

      {/* Location redact toggle */}
      <div className="flex items-center justify-between rounded-xl bg-[var(--bg-card)] px-4 py-2.5">
        <p className="text-xs text-[var(--ink-2)]">Redact location in copies</p>
        <button
          type="button"
          role="switch"
          aria-checked={locationRedact}
          aria-label="Redact location in copies"
          disabled={!enabled}
          onClick={handleLocationRedactToggle}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            locationRedact ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              locationRedact ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Map centering calibration toggle */}
      <div className="flex items-center justify-between rounded-xl bg-[var(--bg-card)] px-4 py-2.5">
        <p className="text-xs text-[var(--ink-2)]">
          Map centering calibration
          <span className="mt-0.5 block text-[10px] text-[var(--ink-3)]">
            Keeps map sheets open + filters drag jitter so you can teach pin centering
          </span>
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={centeringCalibration}
          aria-label="Map centering calibration"
          disabled={!enabled}
          onClick={handleCenteringCalibrationToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            centeringCalibration ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              centeringCalibration ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Preset + category overrides */}
      <CategoryOverrides disabled={!enabled} onRefresh={syncDebugState} />

      {/* Floating Debug button settings */}
      <div
        className={`rounded-xl bg-[var(--bg-card)] px-4 py-3 grid gap-3 ${enabled ? "" : "opacity-60"}`}
        aria-disabled={!enabled}
      >
        <div>
          <p className="text-xs font-semibold text-[var(--ink-2)] mb-1.5">Floating Debug Button</p>
          <div className="flex gap-1 flex-wrap">
            {BUTTON_MODE_LABELS.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                disabled={!enabled}
                onClick={() => handleButtonMode(mode)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                  floatingSettings.buttonMode === mode
                    ? "bg-[var(--flag)] text-[var(--ink-on-dark)]"
                    : "bg-[var(--bg-surface)] text-[var(--ink-2)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 text-xs text-[var(--ink-2)]">
          Show source/opened-by
          <button
            type="button"
            role="switch"
            aria-checked={floatingSettings.showSource}
            aria-label="Show source opened by"
            disabled={!enabled}
            onClick={handleShowSourceToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              floatingSettings.showSource ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                floatingSettings.showSource ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-[var(--ink-2)]">
          Include file path in copies
          <button
            type="button"
            role="switch"
            aria-checked={floatingSettings.includeFileInCopies}
            aria-label="Include file path in copies"
            disabled={!enabled}
            onClick={handleIncludeFileToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              floatingSettings.includeFileInCopies ? "bg-[var(--flag)]" : "bg-[var(--meter-track)]"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                floatingSettings.includeFileInCopies ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {/* Stats + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ink-3)]">
          {allLogs.length} {allLogs.length === 1 ? "entry" : "entries"} · session {getSessionId()}
        </p>
        <button
          type="button"
          disabled={!enabled}
          onClick={syncDebugState}
          className="text-xs font-semibold text-[var(--flag)] disabled:cursor-not-allowed disabled:text-[var(--ink-3)]"
        >
          Refresh
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!enabled}
          onClick={handleClear}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear logs
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={handleDownloadJson}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download JSON
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={handleCopyJson}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy JSON
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={handleCopyCurrentContext}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy current context
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={handleCopyDebugSummary}
          className="rounded-xl bg-[var(--flag)] py-2.5 text-xs font-semibold text-[var(--ink-on-dark)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy Debug Summary
        </button>
      </div>

      {copyStatus ? (
        <p role="status" className="text-center text-xs text-[var(--flag)]">{copyStatus}</p>
      ) : null}

      {/* Log list */}
      <div className="h-[18rem] max-h-[40dvh] min-h-[14rem] shrink-0 overflow-y-auto rounded-xl bg-[var(--bg-card)] px-3 py-2">
        {logs.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--ink-3)]">
            {enabled ? "No logs yet. Interact with the app to capture events." : "Enable debug logging to start capturing."}
          </p>
        ) : (
          <ul aria-label="Recent debug log entries">
            {logs.map((entry, i) => (
              <EntryRow key={i} entry={entry} />
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
