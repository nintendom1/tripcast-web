import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";

export function formatReplayTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type TripReplayHudProps = {
  playheadIndex: number;
  endIndex: number;
  currentPinKind: "checkpoint" | "breadcrumb" | "end";
  currentPinTime: number | null;
  speed: number;
  /** "Full trip" or a formatted start–end label for the active replay window. */
  windowLabel: string;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onScrub: (index: number) => void;
  onOpenSpeedSheet: () => void;
  onOpenDateSheet: () => void;
  onClose: () => void;
};

export function TripReplayHud({
  playheadIndex,
  endIndex,
  currentPinKind,
  currentPinTime,
  speed,
  windowLabel,
  isPaused,
  onTogglePause,
  onRestart,
  onNext,
  onPrevious,
  onScrub,
  onOpenSpeedSheet,
  onOpenDateSheet,
  onClose,
}: TripReplayHudProps) {
  const isEnd = currentPinKind === "end";

  return (
    <motion.div
      key="trip-replay"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="pointer-events-auto absolute bottom-[88px] left-1/2 z-[21] flex w-[calc(100%-24px)] max-w-[390px] -translate-x-1/2 flex-col gap-2.5 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]/80 p-3 text-[var(--ink-1)] shadow-[var(--shadow-card)] backdrop-blur-2xl"
      role="group"
      aria-label="Trip Replay"
      data-replay-hud=""
    >
      {/* Top row: Speed pill · Play/Pause · Date Range pill */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenSpeedSheet}
          aria-label="Change replay speed"
          className="flex min-w-[72px] flex-col items-center justify-center rounded-full bg-[var(--meter-track)] px-3 py-2 text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
        >
          <span className="text-[11px] font-semibold leading-tight">Speed</span>
          <span className="text-[10px] text-[var(--ink-3)]">{speed}x</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevious}
            disabled={playheadIndex <= 0}
            aria-label="Previous pin"
            className="grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-card)] text-[var(--ink-2)] shadow-[var(--shadow-card)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          {isEnd ? (
            <button
              type="button"
              onClick={onRestart}
              aria-label="Replay from start"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-[var(--shadow-card)] transition-transform hover:scale-105 active:scale-95"
            >
              <RotateCcw className="h-6 w-6" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={isPaused ? "Play replay" : "Pause replay"}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-[var(--shadow-card)] transition-transform hover:scale-105 active:scale-95"
            >
              {isPaused ? (
                <Play className="h-7 w-7" aria-hidden="true" style={{ marginLeft: 2 }} />
              ) : (
                <Pause className="h-7 w-7" aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
            disabled={isEnd}
            aria-label="Next pin"
            className="grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-card)] text-[var(--ink-2)] shadow-[var(--shadow-card)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenDateSheet}
          aria-label="Change replay date range"
          className="flex min-w-[72px] flex-col items-center justify-center rounded-full bg-[var(--meter-track)] px-3 py-2 text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper)]"
        >
          <span className="text-[11px] font-semibold leading-tight">Date Range</span>
          <span className="max-w-[80px] truncate text-[10px] text-[var(--ink-3)]">{windowLabel}</span>
        </button>
      </div>

      {/* Bottom row: current beat time + timeline scrubber */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--ink-1)]">
            {isEnd ? "End of replay" : currentPinTime !== null ? formatReplayTime(currentPinTime) : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trip replay"
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={endIndex}
          step={1}
          value={Math.min(endIndex, Math.max(0, playheadIndex))}
          onChange={(event) => onScrub(Number(event.currentTarget.value))}
          className="h-2 w-full accent-[var(--flag)]"
          aria-label="Replay timeline"
        />
      </div>
    </motion.div>
  );
}
