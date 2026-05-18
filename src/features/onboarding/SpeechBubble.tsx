import * as React from "react";

import { cn } from "@/lib/utils";
import { useReadingSpeedSafe } from "@/providers/ReadingSpeedProvider";

export interface SpeechBubbleProps {
  text: string;
  /** Override ms-per-char; otherwise falls back to the `ReadingSpeedProvider` value. */
  speedMs?: number;
  onTypingDone?: () => void;
  className?: string;
}

/**
 * Pixel-character speech bubble with a typewriter reveal. Hard-caps total
 * reveal at 2.5 s so even long panels settle within a beat — the same ceiling
 * used by `RevealText` for story bodies.
 */
const MAX_TYPING_MS = 2500;

export function SpeechBubble({ text, speedMs, onTypingDone, className }: SpeechBubbleProps) {
  const { speedMs: contextMs } = useReadingSpeedSafe();
  const effectiveMs = speedMs ?? contextMs;
  const total = text.length;

  const [shown, setShown] = React.useState<number>(() => (effectiveMs <= 0 ? total : 0));
  const onDoneRef = React.useRef(onTypingDone);
  onDoneRef.current = onTypingDone;

  React.useEffect(() => {
    if (effectiveMs <= 0 || total === 0) {
      setShown(total);
      onDoneRef.current?.();
      return;
    }
    setShown(0);
    const totalMs = Math.min(total * effectiveMs, MAX_TYPING_MS);
    const start = performance.now();
    let cancelled = false;
    let rafId = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min(1, (now - start) / totalMs);
      const next = Math.min(total, Math.floor(total * progress));
      setShown(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        onDoneRef.current?.();
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [text, effectiveMs, total]);

  const done = shown >= total;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text}
      className={cn(
        "relative rounded-2xl bg-[var(--bg-card)] px-4 py-3 shadow-[var(--shadow-card)]",
        "font-[var(--font-display)] text-sm font-semibold leading-relaxed text-[var(--ink-1)]",
        className,
      )}
    >
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-3.5 w-[7px] align-text-bottom"
        style={{
          background: "var(--ink-1)",
          opacity: done ? 0 : 1,
          animation: done ? "none" : "tripcast-pixel-blink 0.7s steps(2) infinite",
        }}
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-2 left-7 h-0 w-0"
        style={{
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "8px solid var(--bg-card)",
        }}
      />
    </div>
  );
}
