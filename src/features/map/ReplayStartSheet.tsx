import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import type { ReplaySourceMode } from "./replaySession";

export type ReplayStartSheetProps = {
  open: boolean;
  hasResume: boolean;
  loading?: boolean;
  error?: string | null;
  onSelect: (source: ReplaySourceMode | "continue") => void;
  onClose: () => void;
};

export default function ReplayStartSheet({ open, hasResume, loading = false, error = null, onSelect, onClose }: ReplayStartSheetProps) {
  const choices: Array<{ value: ReplaySourceMode | "continue"; label: string; detail: string; disabled?: boolean }> = [
    { value: "recent", label: "Recent activity", detail: "Replay the latest 50 located moments." },
    { value: "continue", label: "Continue where you left off", detail: hasResume ? "Resume your last Replay source and position." : "No saved Replay position yet.", disabled: !hasResume },
    { value: "beginning", label: "Start from beginning", detail: "Load the trip progressively from its first available moment." },
    { value: "custom", label: "Custom date range", detail: "Choose exact start and end date-times." },
  ];
  return (
    <Sheet open={open} modal={false} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" showBackdrop={false} className="z-[60] mx-auto max-w-md gap-4 rounded-t-xl px-5 pb-8 pt-3" aria-label="Start Trip Replay">
        <div className="mx-auto h-1 w-12 rounded-full bg-[var(--line-soft)]" aria-hidden="true" />
        <SheetTitle className="text-center text-base font-semibold text-[var(--ink-1)]">Start Trip Replay</SheetTitle>
        {loading ? <p role="status" className="text-center text-sm font-medium text-[var(--ink-2)]">Loading Replay…</p> : null}
        {error ? <p role="alert" className="rounded-lg bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]">{error}</p> : null}
        <div className="grid gap-2">
          {choices.map((choice) => (
            <button key={choice.value} type="button" disabled={loading || choice.disabled} onClick={() => onSelect(choice.value)} className="rounded-xl bg-[var(--meter-track)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-paper)] disabled:cursor-not-allowed disabled:opacity-45">
              <span className="block text-sm font-semibold text-[var(--ink-1)]">{choice.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--ink-3)]">{choice.detail}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
