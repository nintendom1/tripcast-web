import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";

export type ReplayPoiCardProps = {
  /** Resolved story image URL. When absent, the scrapbook photo is omitted. */
  imageUrl?: string | null;
  title: string;
  /** Optional note/body snippet; clamped to two lines. */
  note?: string | null;
  /** Scrapbook tilt in degrees (e.g. -2..2) for the "tossed photo" look. */
  tilt?: number;
  onClick?: () => void;
  className?: string;
  /**
   * Multiplier (0..1) applied to the slide in/out durations so the card can play
   * fully inside the shorter checkpoint dwell at high replay speeds. 1 = normal.
   */
  transitionScale?: number;
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void;
};

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * Presentational POI card shown during trip replay: a scrapbook photo that
 * slides in from the left and a title/note card that slides in from the right
 * (staggered). On exit they slide back out in opposite directions. Map- and
 * Convex-free so it can be exercised in Storybook.
 */
export function ReplayPoiCard({
  imageUrl,
  title,
  note,
  tilt = 0,
  onClick,
  className,
  transitionScale = 1,
  onImageLoad,
}: ReplayPoiCardProps) {
  const reduce = useReducedMotion();

  // Scale the slide timings so the card fits the dwell at speed (clamped so it stays
  // perceptible). Slide in slower (settle), out faster (clear) — keeps the card from
  // lingering over the end-of-replay fit.
  const scale = Math.max(0.2, Math.min(1, transitionScale));
  const inDuration = 0.45 * scale;
  const textDelay = 0.15 * scale;
  const exitTransition = { duration: 0.3 * scale, ease: "easeIn" } as const;

  const photoMotion = reduce
    ? {
        initial: { opacity: 0, rotate: tilt },
        animate: { opacity: 1, rotate: tilt },
        exit: { opacity: 0, rotate: tilt },
        transition: { duration: 0.001 },
      }
    : {
        initial: { opacity: 0, x: -40, rotate: tilt },
        animate: { opacity: 1, x: 0, rotate: tilt },
        exit: { opacity: 0, x: -20, rotate: tilt, transition: exitTransition },
        transition: { duration: inDuration, ease: EASE },
      };

  const textMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.001 },
      }
    : {
        initial: { opacity: 0, x: 40 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 20, transition: exitTransition },
        transition: { duration: inDuration, ease: EASE, delay: textDelay },
      };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "pointer-events-auto flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:gap-3",
        "transition-transform active:scale-95",
        className,
      )}
    >
      {imageUrl ? (
        <motion.div
          {...photoMotion}
          className="shrink-0 bg-white p-1.5 shadow-[2px_2px_0_var(--line-strong)]"
          style={{ border: "1.5px solid var(--flag)" }}
        >
          <img
            src={imageUrl}
            alt=""
            className="h-28 w-40 rounded-sm object-cover sm:h-32 sm:w-44"
            onLoad={(e) => onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          />
        </motion.div>
      ) : null}
      <motion.div
        {...textMotion}
        className="max-w-[260px] rounded-2xl border-l-4 border-[var(--flag)] bg-[var(--bg-card)]/95 px-4 py-3 text-left shadow-2xl backdrop-blur-md"
      >
        <p className="text-sm font-bold leading-tight text-[var(--ink-1)]">{title}</p>
        {note ? (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-[var(--ink-2)]">{note}</p>
        ) : null}
      </motion.div>
    </button>
  );
}

export default ReplayPoiCard;
