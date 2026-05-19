import { useState, useCallback, useEffect } from "react";
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
  subscribe,
  type DebugEntry,
  type DebugCategory,
  type DebugPreset,
} from "./debugLogger";

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
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
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

function CategoryOverrides({ onRefresh }: { onRefresh: () => void }) {
  const [, forceRender] = useState(0);

  function handlePresetClick(p: DebugPreset) {
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
    setCategoryOverride(cat, checked);
    forceRender((n) => n + 1);
    onRefresh();
  }

  const currentPreset = getPreset();

  return (
    <div className="rounded-xl bg-[var(--bg-card)] px-4 py-3 grid gap-3">
      {/* Preset selector */}
      <div>
        <p className="text-xs font-semibold text-[var(--ink-2)] mb-1.5">Verbosity Preset</p>
        <div className="flex gap-1 flex-wrap">
          {PRESET_LABELS.map(({ preset, label }) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetClick(preset)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
                  disabled={isAlwaysOn}
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
  const [locationRedact, setLocationRedactState] = useState(getLocationRedact);
  const [logs, setLogs] = useState<DebugEntry[]>(() => getLogs().slice(-50).reverse());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLogs(getLogs().slice(-50).reverse());
  }, []);

  // Auto-refresh when new entries arrive
  useEffect(() => {
    return subscribe(refresh);
  }, [refresh]);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setEnabledState(next);
  }

  function handleLocationRedactToggle() {
    const next = !locationRedact;
    setLocationRedact(next);
    setLocationRedactState(next);
  }

  function handleClear() {
    clearLogs();
    setLogs([]);
    setCopyStatus(null);
  }

  async function handleCopyJson() {
    const all = getLogs();
    try {
      await copyToClipboard(JSON.stringify(all, null, 2));
      setCopyStatus("Copied JSON!");
    } catch {
      downloadJson(`tripcast-debug-${getSessionId()}.json`, all);
      setCopyStatus("Downloaded JSON (clipboard unavailable)");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  }

  function handleDownloadJson() {
    downloadJson(`tripcast-debug-${getSessionId()}.json`, getLogs());
  }

  async function handleCopyDebugSummary() {
    const summary = buildLlmSummary();
    try {
      await copyToClipboard(summary);
      setCopyStatus("Copied debug summary!");
    } catch {
      downloadJson(`tripcast-debug-summary-${getSessionId()}.md`, summary);
      setCopyStatus("Downloaded summary (clipboard unavailable)");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  }

  const allLogs = getLogs();

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-5 pb-6">
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
          Dev Tools
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

      {/* Location redact toggle */}
      <div className="flex items-center justify-between rounded-xl bg-[var(--bg-card)] px-4 py-2.5">
        <p className="text-xs text-[var(--ink-2)]">Redact location in copies</p>
        <button
          type="button"
          role="switch"
          aria-checked={locationRedact}
          onClick={handleLocationRedactToggle}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
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

      {/* Preset + category overrides */}
      <CategoryOverrides onRefresh={refresh} />

      {/* Stats + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ink-3)]">
          {allLogs.length} {allLogs.length === 1 ? "entry" : "entries"} · session {getSessionId()}
        </p>
        <button
          type="button"
          onClick={refresh}
          className="text-xs font-semibold text-[var(--flag)]"
        >
          Refresh
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm"
        >
          Clear logs
        </button>
        <button
          type="button"
          onClick={handleDownloadJson}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={handleCopyJson}
          className="rounded-xl bg-[var(--bg-card)] py-2.5 text-xs font-semibold text-[var(--ink-2)] shadow-sm"
        >
          Copy JSON
        </button>
        <button
          type="button"
          onClick={handleCopyDebugSummary}
          className="rounded-xl bg-[var(--flag)] py-2.5 text-xs font-semibold text-[var(--ink-on-dark)] shadow-sm"
        >
          Copy Debug Summary
        </button>
      </div>

      {copyStatus ? (
        <p role="status" className="text-center text-xs text-[var(--flag)]">{copyStatus}</p>
      ) : null}

      {/* Log list */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-[var(--bg-card)] px-3 py-2">
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
