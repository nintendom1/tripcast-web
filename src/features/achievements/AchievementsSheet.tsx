import { useEffect } from "react";
import { Award, Trophy } from "lucide-react";

import type { AchievementEvent, ScoreSummary } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { cn } from "@/lib/utils";
import { useDebugLogger } from "../../debug/useDebugLogger";

type Props = {
  open: boolean;
  summary: ScoreSummary;
  onOpenChange: (open: boolean) => void;
};

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function HistoryRow({ event }: { event: AchievementEvent }) {
  const isNew = event.seenAt === undefined;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-[var(--bg-card)] p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--meter-track)] text-[var(--ink-2)]">
        <Award className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
          {event.title}
          {isNew ? (
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--flag)]"
            />
          ) : null}
        </p>
        <p className="truncate text-xs text-[var(--ink-3)]">{event.message}</p>
      </div>
      <span className="font-[var(--font-mono)] text-xs font-semibold text-[var(--ink-3)]">
        {formatWhen(event.createdAt)}
      </span>
    </li>
  );
}

export default function AchievementsSheet({ open, summary, onOpenChange }: Props) {
  const log = useDebugLogger(
    "AchievementsSheet",
    "src/features/achievements/AchievementsSheet.tsx",
  );

  useEffect(() => {
    log.logInteraction(open ? "sheet:open" : "sheet:close");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
        )}
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-3 px-5 pt-3">
          <div className="grid gap-1">
            <SheetKicker>Achievements</SheetKicker>
            <SheetTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[var(--flag)]" aria-hidden />
              {summary.total} {summary.total === 1 ? "point" : "points"}
            </SheetTitle>
            {summary.isDev ? (
              <p className="text-xs font-semibold text-[var(--flag)]">
                Testing Follower achievements as Traveler
              </p>
            ) : null}
          </div>
          <SheetCloseButton />
        </div>

        <SheetBody className="grid gap-4 px-5">
          <section className="grid gap-2">
            <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
              Point log
            </h3>
            {summary.recent.length > 0 ? (
              <ul className="grid gap-2">
                {summary.recent.map((event) => (
                  <HistoryRow key={event._id} event={event} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
                No achievements yet. Check in daily and create Missions to earn
                points.
              </p>
            )}
          </section>

          <section className="grid gap-2">
            <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
              Badges
            </h3>
            <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
              Badges are coming later.
            </p>
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
