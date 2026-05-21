import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { useAchievements } from "./useAchievements";
import AchievementsSheet from "./AchievementsSheet";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger, type DebugLogger } from "../../debug/useDebugLogger";

type Props = {
  token: string;
  className?: string;
};

type ToastState = { main: string; sub: string; points: number; count: number };

/**
 * Self-contained achievements surface: a floating score button (with unread
 * dot), the Achievements sheet, and queued achievement toasts. Renders nothing
 * when the current user has no scoring identity (e.g. a Traveler with developer
 * scoring disabled) — driven entirely by the backend `getScoreSummary` result.
 */
export default function AchievementsConnected({ token, className }: Props) {
  const { summary, untoasted, markToasted, markSeen } = useAchievements(token);
  const music = useMusicSafe();
  const log = useDebugLogger(
    "AchievementsConnected",
    "src/features/achievements/AchievementsConnected.tsx",
  );
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const prevTotalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    };
  }, []);

  // Point changes: log the score total whenever it changes (and once on first
  // load), so the ledger's effect on the derived total is traceable.
  useEffect(() => {
    if (summary === undefined || summary === null) return;
    const prev = prevTotalRef.current;
    if (prev === null) {
      log.logUi("achievement:points:init", {
        total: summary.total,
        count: summary.count,
        unseenCount: summary.unseenCount,
        isDev: summary.isDev,
      });
    } else if (prev !== summary.total) {
      log.logUi("achievement:points:change", {
        from: prev,
        to: summary.total,
        delta: summary.total - prev,
        count: summary.count,
        isDev: summary.isDev,
      });
    }
    prevTotalRef.current = summary.total;
  }, [summary, log]);

  // Queue an achievement toast for any newly-earned (untoasted) events, then
  // mark them toasted so they do not re-toast on reload.
  useEffect(() => {
    if (!untoasted || untoasted.length === 0) return;
    const fresh = untoasted.filter((e) => !toastedIdsRef.current.has(e._id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => toastedIdsRef.current.add(e._id));

    const points = fresh.reduce((sum, e) => sum + e.points, 0);
    const nextToast: ToastState =
      fresh.length === 1
        ? { main: fresh[0].title, sub: fresh[0].message, points, count: 1 }
        : {
            main: `You earned ${fresh.length} achievements`,
            sub: `+${points} points`,
            points,
            count: fresh.length,
          };
    setToast(nextToast);
    log.logUi("achievement:toast:queued", {
      main: nextToast.main,
      sub: nextToast.sub,
      points: nextToast.points,
      count: nextToast.count,
    });
    music.sfx("open");
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);

    markToasted({ token, ids: fresh.map((e) => e._id) }).catch(() => {
      // best-effort; will retry next open if it failed
    });
  }, [untoasted, token, markToasted, music, log]);

  // No scoring identity (or still loading) → render nothing.
  if (summary === undefined || summary === null) {
    return (
      <AchievementToast toast={toast} log={log} />
    );
  }

  function handleOpen() {
    music.sfx("open");
    setOpen(true);
    markSeen({ token }).catch(() => {});
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Achievements. ${summary.total} points.${
          summary.unseenCount > 0 ? ` ${summary.unseenCount} new.` : ""
        }`}
        className={
          "relative grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-card)] shadow-[var(--shadow-card)] transition-transform active:scale-[0.96] " +
          (className ?? "")
        }
      >
        <Trophy className="h-5 w-5 text-[var(--flag)]" aria-hidden />
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--ink-1)] px-1.5 font-[var(--font-mono)] text-[10px] font-bold leading-4 text-[var(--ink-on-dark)]">
          {summary.total}
        </span>
        {summary.unseenCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[var(--bg-card)] bg-[var(--flag)]"
          />
        ) : null}
      </button>

      <AchievementsSheet open={open} summary={summary} onOpenChange={setOpen} />

      <AchievementToast toast={toast} log={log} />
    </>
  );
}

function AchievementToast({
  toast,
  log,
}: {
  toast: ToastState | null;
  log: DebugLogger;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Log the toast's actual rendered text/points, placement, and measured
  // dimensions once it is in the DOM.
  useEffect(() => {
    if (!toast || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    log.logUi("achievement:toast:shown", {
      main: toast.main,
      sub: toast.sub,
      points: toast.points,
      count: toast.count,
      placement: "fixed top-center (top-2, -translate-x-1/2)",
      dims: {
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
        right: Math.round(r.right),
      },
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });
  }, [toast, log]);

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          ref={ref}
          key="achievement-toast"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" as const }}
          role="status"
          className="fixed left-1/2 top-2 z-[60] flex max-w-[calc(100%-8rem)] -translate-x-1/2 items-center gap-2.5 rounded-md bg-[var(--ink-1)] px-4 py-2.5 text-[var(--ink-on-dark)] shadow-lg"
        >
          <Trophy className="h-5 w-5 shrink-0 text-[var(--flag)]" aria-hidden />
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">{toast.main}</div>
            <div className="text-xs opacity-80">{toast.sub}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
