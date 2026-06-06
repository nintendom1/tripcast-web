import * as React from "react";
import { cn } from "@/lib/utils";

export interface DualRangeSliderProps {
  /** Inclusive domain minimum. */
  min: number;
  /** Inclusive domain maximum. */
  max: number;
  /** Step between selectable values. Defaults to 1. */
  step?: number;
  /** Current selected range. `start <= end` is enforced on change. */
  value: { start: number; end: number };
  onChange: (next: { start: number; end: number }) => void;
  /** Accessible labels for the two thumbs. */
  startLabel?: string;
  endLabel?: string;
  className?: string;
}

/**
 * Minimal two-thumb range slider built from two overlaid native range inputs.
 * The lower input sits above the upper one only near the active thumb so both
 * remain draggable. Styling uses theme tokens (`--flag`, `--meter-track`); the
 * filled segment is a gradient between the two positions.
 *
 * Kept intentionally small — no external dependency — for the Replay date sheet.
 */
export function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  startLabel = "Range start",
  endLabel = "Range end",
  className,
}: DualRangeSliderProps) {
  const span = Math.max(1, max - min);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const startPct = ((clamp(value.start) - min) / span) * 100;
  const endPct = ((clamp(value.end) - min) / span) * 100;

  const handleStart = (next: number) => {
    onChange({ start: Math.min(next, value.end), end: value.end });
  };
  const handleEnd = (next: number) => {
    onChange({ start: value.start, end: Math.max(next, value.start) });
  };

  // Give whichever thumb is "on top" priority for pointer events. When the two
  // collapse together, raise the start thumb's z-index so it can move off zero.
  const startOnTop = value.start >= value.end;

  return (
    <div className={cn("relative h-6 w-full", className)}>
      {/* Base track */}
      <div className="pointer-events-none absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[var(--meter-track)]" />
      {/* Active (filled) segment */}
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--flag)]"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <input
        type="range"
        aria-label={startLabel}
        min={min}
        max={max}
        step={step}
        value={clamp(value.start)}
        onChange={(e) => handleStart(Number(e.currentTarget.value))}
        className={cn(
          "dual-range-thumb absolute inset-0 m-0 h-6 w-full cursor-ew-resize appearance-none bg-transparent",
          startOnTop ? "z-30" : "z-20",
        )}
      />
      <input
        type="range"
        aria-label={endLabel}
        min={min}
        max={max}
        step={step}
        value={clamp(value.end)}
        onChange={(e) => handleEnd(Number(e.currentTarget.value))}
        className="dual-range-thumb absolute inset-0 z-20 m-0 h-6 w-full cursor-ew-resize appearance-none bg-transparent"
      />
    </div>
  );
}

export default DualRangeSlider;
