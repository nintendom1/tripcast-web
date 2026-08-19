import { AlertTriangle, RefreshCw, Settings } from "lucide-react";

export type LiveSafetyNoticeProps = {
  kind: "capture" | "activity";
  onRetry: () => void;
  onOpenSettings: () => void;
};

export function LiveSafetyNotice({ kind, onRetry, onOpenSettings }: LiveSafetyNoticeProps) {
  return (
    <div className="pointer-events-auto rounded-xl border border-[var(--amber)] bg-[var(--bg-card)] px-3 py-2.5 shadow-[var(--shadow-card)]" role="status">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--ink-1)]">
            {kind === "capture"
              ? "Background trail isn’t protected. Keep TripCast open."
              : "Location is still being saved, but Lock Screen status is unavailable."}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-md bg-[var(--ink-1)] px-2 py-1 text-[10px] font-bold text-[var(--bg-card)]">
              <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
            </button>
            <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1 rounded-md border border-[var(--line-soft)] px-2 py-1 text-[10px] font-bold text-[var(--ink-2)]">
              <Settings className="h-3 w-3" aria-hidden="true" /> Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
