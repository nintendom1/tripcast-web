import { useEffect, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { DualRangeSlider } from "../../components/ui/DualRangeSlider";

export interface ReplayDateRangeSheetProps {
  open: boolean;
  /** Full (pre-window) time span of the trip, or null when no data exists. */
  bounds: { min: number; max: number } | null;
  /** Currently applied window, or null for the full trip. */
  window: { startAt: number; endAt: number } | null;
  onApply: (startAt: number, endAt: number) => void;
  onReset: () => void;
  onClose: () => void;
}

const SLIDER_STEP_MS = 60_000; // 1-minute granularity keeps the handles smooth.

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Bottom sheet for selecting the Replay date-range window via a double slider.
 * Drafts the selection locally and only commits on Apply, matching the mockup's
 * Cancel / Apply header. "Reset to full trip" clears the window.
 */
export default function ReplayDateRangeSheet({
  open,
  bounds,
  window,
  onApply,
  onReset,
  onClose,
}: ReplayDateRangeSheetProps) {
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);

  // Re-seed the draft from the applied window (or full bounds) whenever the sheet
  // opens, so each visit starts from the current truth.
  useEffect(() => {
    if (!open || !bounds) return;
    setDraft({
      start: window?.startAt ?? bounds.min,
      end: window?.endAt ?? bounds.max,
    });
  }, [open, bounds, window]);

  const effectiveDraft =
    draft ?? (bounds ? { start: bounds.min, end: bounds.max } : null);

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[60] mx-auto max-w-md gap-6 rounded-t-xl px-5 pb-8 pt-3"
        aria-label="Replay date range"
      >
        <div className="mx-auto h-1 w-12 rounded-full bg-[var(--line-soft)]" aria-hidden="true" />

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
          >
            Cancel
          </button>
          <SheetTitle className="text-base font-semibold text-[var(--ink-1)]">
            Select Date Range
          </SheetTitle>
          <button
            type="button"
            disabled={!effectiveDraft}
            onClick={() => {
              if (effectiveDraft) onApply(effectiveDraft.start, effectiveDraft.end);
            }}
            className="text-sm font-semibold text-[var(--flag)] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Apply
          </button>
        </div>

        {!bounds || !effectiveDraft ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            No trip data to filter yet.
          </p>
        ) : (
          <>
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg bg-[var(--meter-track)] p-3 text-center">
                <span className="mb-1 block text-xs text-[var(--ink-3)]">Start</span>
                <span className="text-sm font-semibold text-[var(--ink-1)]">
                  {formatDateTime(effectiveDraft.start)}
                </span>
              </div>
              <div className="flex-1 rounded-lg bg-[var(--meter-track)] p-3 text-center">
                <span className="mb-1 block text-xs text-[var(--ink-3)]">End</span>
                <span className="text-sm font-semibold text-[var(--ink-1)]">
                  {formatDateTime(effectiveDraft.end)}
                </span>
              </div>
            </div>

            <DualRangeSlider
              min={bounds.min}
              max={bounds.max}
              step={SLIDER_STEP_MS}
              value={effectiveDraft}
              onChange={setDraft}
              startLabel="Replay window start"
              endLabel="Replay window end"
            />

            <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
              <span>{formatDateTime(bounds.min)}</span>
              <span>{formatDateTime(bounds.max)}</span>
            </div>

            {window ? (
              <button
                type="button"
                onClick={onReset}
                className="w-full rounded-full bg-[var(--meter-track)] py-2.5 text-sm font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
              >
                Reset to full trip
              </button>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
