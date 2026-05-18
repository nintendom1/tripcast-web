import * as React from "react";

import { cn } from "@/lib/utils";
import { useReadingSpeedSafe } from "@/providers/ReadingSpeedProvider";

/**
 * Hard ceiling on how long a reveal animation may take, regardless of how many
 * characters need to reveal or how slow the user's reading-speed setting is.
 *
 * Long stories at "slow" (30 ms/char) would otherwise crawl for tens of seconds
 * — the cap accelerates them so the whole on-screen passage settles within a
 * comfortable beat while preserving the user's pace preference on short text.
 */
const MAX_REVEAL_MS = 2500;

export interface RevealTextProps {
  text: string;
  /** Override the reading speed for this instance (ms per char). Falls back to `useReadingSpeed`. */
  speedMsOverride?: number;
  /** Skip the animation and reveal everything immediately. */
  instant?: boolean;
  /** Optional reveal-complete callback, fires once when the last character lands. */
  onComplete?: () => void;
  className?: string;
  /** ARIA label for screen readers — defaults to the full text so they skip the reveal. */
  ariaLabel?: string;
}

/**
 * RevealText animates a body of text in character by character without shifting
 * layout: every character is rendered in its final position from the start,
 * and color transitions from transparent to currentColor as the reveal progresses.
 *
 * Word kerning and line breaks therefore match the static rendering exactly —
 * the design's "letter-by-letter fade without breaking word kerning" requirement.
 *
 * Screen readers read the full text immediately via `aria-label`; the animated
 * span itself is marked `aria-hidden`.
 */
export function RevealText({
  text,
  speedMsOverride,
  instant = false,
  onComplete,
  className,
  ariaLabel,
}: RevealTextProps) {
  const { speedMs: contextSpeedMs } = useReadingSpeedSafe();
  const speedMs = speedMsOverride ?? contextSpeedMs;
  const total = text.length;

  const [revealed, setRevealed] = React.useState<number>(() => {
    if (instant || speedMs <= 0 || total === 0) return total;
    return 0;
  });

  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Effective per-char duration used by the per-char fade transition. When the
  // total at the chosen speed would exceed MAX_REVEAL_MS, this scales down so
  // each character's fade matches the compressed pace.
  const effectiveCharMs = React.useMemo(() => {
    if (total === 0) return speedMs;
    return Math.min(speedMs, MAX_REVEAL_MS / total);
  }, [speedMs, total]);

  React.useEffect(() => {
    if (instant || speedMs <= 0 || total === 0) {
      setRevealed(total);
      onCompleteRef.current?.();
      return;
    }
    setRevealed(0);
    const totalMs = Math.min(total * speedMs, MAX_REVEAL_MS);
    let rafId = 0;
    let cancelled = false;
    const start =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / totalMs);
      const next = Math.min(total, Math.floor(total * progress));
      setRevealed(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        onCompleteRef.current?.();
      }
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [text, speedMs, instant, total]);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)} aria-label={ariaLabel ?? text}>
      {Array.from(text).map((ch, i) => {
        const visible = i < revealed;
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              color: visible ? "currentColor" : "transparent",
              transition:
                effectiveCharMs > 0
                  ? `color ${Math.min(140, effectiveCharMs * 6)}ms ease-out`
                  : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
