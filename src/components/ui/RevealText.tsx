import * as React from "react";

import { cn } from "@/lib/utils";
import { useReadingSpeedSafe } from "@/providers/ReadingSpeedProvider";

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
    if (instant || speedMs <= 0) return total;
    return 0;
  });

  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    if (instant || speedMs <= 0) {
      setRevealed(total);
      onCompleteRef.current?.();
      return;
    }
    setRevealed(0);
    let cancelled = false;
    let i = 0;
    const id = window.setInterval(() => {
      if (cancelled) return;
      i += 1;
      setRevealed(i);
      if (i >= total) {
        window.clearInterval(id);
        onCompleteRef.current?.();
      }
    }, speedMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
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
              transition: speedMs > 0 ? `color ${Math.min(140, speedMs * 6)}ms ease-out` : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
