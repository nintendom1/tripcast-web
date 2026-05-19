import { useState, useCallback } from "react";
import {
  isEnabled,
  setEnabled,
  getLogs,
  clearLogs,
  buildLlmSummary,
  getSessionId,
  type DebugEntry,
} from "./debugLogger";

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback: textarea select + execCommand
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

function EntryRow({ entry }: { entry: DebugEntry }) {
  const elapsedSec = (entry.elapsed / 1000).toFixed(1);
  const detStr = entry.details ? " · " + JSON.stringify(entry.details) : "";
  const levelCls = LEVEL_COLORS[entry.level];

  return (
    <li className="border-b border-[var(--line-soft)] py-1.5 last:border-0">
      <p className={`font-[var(--font-mono)] text-[11px] leading-snug ${levelCls}`}>
        <span className="text-[var(--ink-3)]">+{elapsedSec}s</span>
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
// Panel
// ---------------------------------------------------------------------------

export default function DebugPanel({ onBack }: { onBack: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [logs, setLogs] = useState<DebugEntry[]>(() => getLogs().slice(-50).reverse());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLogs(getLogs().slice(-50).reverse());
  }, []);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setEnabledState(next);
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

  async function handleCopyLlm() {
    const summary = buildLlmSummary();
    try {
      await copyToClipboard(summary);
      setCopyStatus("Copied LLM summary!");
    } catch {
      downloadJson(`tripcast-debug-summary-${getSessionId()}.md`, summary);
      setCopyStatus("Downloaded summary (clipboard unavailable)");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  }

  const allLogs = getLogs();

  return (
    <div className="grid gap-5 px-5 pb-6">
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
          onClick={handleCopyLlm}
          className="rounded-xl bg-[var(--flag)] py-2.5 text-xs font-semibold text-[var(--ink-on-dark)] shadow-sm"
        >
          Copy LLM Summary
        </button>
      </div>

      {copyStatus ? (
        <p role="status" className="text-center text-xs text-[var(--flag)]">{copyStatus}</p>
      ) : null}

      {/* Log list */}
      {logs.length === 0 ? (
        <p className="text-center text-xs text-[var(--ink-3)]">
          {enabled ? "No logs yet. Interact with the app to capture events." : "Enable debug logging to start capturing."}
        </p>
      ) : (
        <div className="rounded-xl bg-[var(--bg-card)] px-3">
          <ul aria-label="Recent debug log entries">
            {logs.map((entry, i) => (
              <EntryRow key={i} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
