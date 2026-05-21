import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { useAchievements } from "./useAchievements";
import AchievementsSheet from "./AchievementsSheet";
import type { ScoreSummary } from "../../convex/tripcastApi";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger, type DebugLogger } from "../../debug/useDebugLogger";

type Props = {
  token: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showButton?: boolean;
};

type ToastState = { main: string; sub: string; points: number; count: number };

const EMPTY_SCORE_SUMMARY: ScoreSummary = {
  total: 0,
  count: 0,
  isDev: false,
  unseenCount: 0,
  recent: [],
};

/**
 * Self-contained achievements surface: a floating score button (with unread
 * dot), the Achievements sheet, and queued achievement toasts. Renders nothing
 * when the current user has no scoring identity (e.g. a Traveler with developer
 * scoring disabled) — driven entirely by the backend `getScoreSummary` result.
 */
export default function AchievementsConnected({
  token,
  className,
  open: controlledOpen,
  onOpenChange,
  showButton = true,
}: Props) {
  const { summary, untoasted, markToasted, markSeen } = useAchievements(token);
  const music = useMusicSafe();
  const log = useDebugLogger(
    "AchievementsConnected",
    "src/features/achievements/AchievementsConnected.tsx",
  );
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  // Pending achievement toasts, shown one at a time (FIFO). Each newly-earned
  // event gets its own toast — they are never batched into a summary.
  const [queue, setQueue] = useState<ToastState[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const prevTotalRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

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

  // Enqueue one toast per newly-earned (untoasted) event, then mark them
  // toasted so they do not re-toast on reload.
  useEffect(() => {
    if (!untoasted || untoasted.length === 0) return;
    const fresh = untoasted.filter((e) => !toastedIdsRef.current.has(e._id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => toastedIdsRef.current.add(e._id));

    const newToasts: ToastState[] = fresh.map((e) => ({
      main: e.title,
      sub: e.message,
      points: e.points,
      count: 1,
    }));
    setQueue((current) => [...current, ...newToasts]);
    log.logUi("achievement:toast:queued", { count: newToasts.length });

    markToasted({ token, ids: fresh.map((e) => e._id) }).catch(() => {
      // best-effort; will retry next open if it failed
    });
  }, [untoasted, token, markToasted, log]);

  // Show the next queued toast once nothing is showing (small gap so the prior
  // toast finishes its exit animation before the next enters).
  useEffect(() => {
    if (toast !== null || queue.length === 0) return;
    const timer = setTimeout(() => {
      setToast(queue[0]);
      setQueue((current) => current.slice(1));
      music.sfx("open");
    }, 250);
    return () => clearTimeout(timer);
  }, [toast, queue, music]);

  // Auto-dismiss the current toast after its display window.
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (summary === undefined || summary === null) {
      return;
    }
    if (open && !wasOpenRef.current) {
      markSeen({ token }).catch(() => {});
    }
    wasOpenRef.current = open;
  }, [open, summary, token, markSeen]);

  // Still loading, or no scoring identity for the legacy floating trigger.
  if (summary === undefined || (summary === null && showButton)) {
    return (
      <AchievementToast toast={toast} log={log} />
    );
  }

  const sheetSummary = summary ?? EMPTY_SCORE_SUMMARY;

  function handleOpen() {
    music.sfx("open");
    setOpen(true);
  }

  return (
    <>
      {showButton ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Achievements. ${sheetSummary.total} points.${
            sheetSummary.unseenCount > 0 ? ` ${sheetSummary.unseenCount} new.` : ""
          }`}
          className={
            "relative grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-card)] shadow-[var(--shadow-card)] transition-transform active:scale-[0.96] " +
            (className ?? "")
          }
        >
          <Trophy className="h-5 w-5 text-[var(--flag)]" aria-hidden />
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--ink-1)] px-1.5 font-[var(--font-mono)] text-[10px] font-bold leading-4 text-[var(--ink-on-dark)]">
            {sheetSummary.total}
          </span>
          {sheetSummary.unseenCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[var(--bg-card)] bg-[var(--flag)]"
            />
          ) : null}
        </button>
      ) : null}

      <AchievementsSheet
        open={open}
        summary={sheetSummary}
        token={token}
        onOpenChange={setOpen}
      />

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
