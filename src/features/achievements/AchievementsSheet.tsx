import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Award, ChevronLeft, Lock, Trophy } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type {
  AchievementEvent,
  BadgeBoardEntry,
  ScoreSummary,
} from "../../convex/tripcastApi";
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
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import BadgeBoard, { BADGE_COLOR } from "./BadgeBoard";

type Props = {
  open: boolean;
  summary: ScoreSummary;
  token: string;
  onOpenChange: (open: boolean) => void;
};

type Tab = "badges" | "history";

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
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
      {/* Points are shown ONLY in History (never on Badge chips/detail). */}
      <span className="shrink-0 font-[var(--font-mono)] text-xs font-semibold text-[var(--ink-2)]">
        +{event.points}
      </span>
      <span className="shrink-0 font-[var(--font-mono)] text-[10px] text-[var(--ink-3)]">
        {formatWhen(event.createdAt)}
      </span>
    </li>
  );
}

function BadgeDetail({
  entry,
  onBack,
}: {
  entry: BadgeBoardEntry;
  onBack: () => void;
}) {
  const earned = entry.earned;
  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--ink-3)]"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back to badges
      </button>

      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-4",
          earned
            ? BADGE_COLOR[entry.badgeType]
            : "border-dashed border-[var(--meter-track)] bg-[var(--bg-card)] text-[var(--ink-3)]",
        )}
      >
        <span className="text-3xl leading-none" aria-hidden>
          {earned ? entry.emoji : "🔒"}
        </span>
        <div className="min-w-0">
          {/* Unachieved detail keeps "???" as the title — never reveals the name. */}
          <p className="text-lg font-extrabold leading-tight">
            {earned ? entry.name : "???"}
          </p>
          {earned && entry.count > 1 ? (
            <p className="text-xs font-semibold">Earned ×{entry.count}</p>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-[var(--ink-2)]">{entry.description}</p>

      {!earned ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)]">
          <Lock className="h-3.5 w-3.5" aria-hidden /> Not earned yet.
        </p>
      ) : null}

      {earned && entry.awards.length > 0 ? (
        <section className="grid gap-2">
          <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
            Awarded for
          </h3>
          <ul className="grid gap-2">
            {entry.awards.map((award, i) => (
              <li
                key={`${award.sourceType}-${award.awardedAt}-${i}`}
                className="rounded-xl bg-[var(--bg-card)] p-3"
              >
                <p className="text-sm font-semibold text-[var(--ink-1)]">
                  {award.sourceLabel}
                </p>
                <p className="text-xs text-[var(--ink-3)]">
                  {new Date(award.awardedAt).toLocaleDateString([], {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {award.note ? (
                  <p className="mt-1 text-xs italic text-[var(--ink-2)]">
                    &ldquo;{award.note}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function AchievementsSheet({
  open,
  summary,
  token,
  onOpenChange,
}: Props) {
  const log = useDebugLogger(
    "AchievementsSheet",
    "src/features/achievements/AchievementsSheet.tsx",
  );
  const [tab, setTab] = useState<Tab>("badges");
  const [detailBadge, setDetailBadge] = useState<BadgeBoardEntry | null>(null);
  const activeView = detailBadge ? "badge-detail" : tab;
  useActiveUiContext(open, {
    sheetName: "AchievementsSheet",
    label: "Achievements",
    view: activeView,
    source: "achievements-chip",
    sourceLabel: "Badge chip",
    file: "src/features/achievements/AchievementsSheet.tsx",
  }, { boundsSelector: "[data-role='achievements-sheet']" });

  const board = useQuery(
    tripcastApi.badges.getMyBadges,
    open ? { token } : "skip",
  );
  const history = useQuery(
    tripcastApi.scoring.listAchievementHistory,
    open && tab === "history" ? { token } : "skip",
  );

  useEffect(() => {
    log.logInteraction(open ? "achievement:menu:open" : "achievement:menu:close");
    if (!open) {
      setDetailBadge(null);
      setTab("badges");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && board) {
      log.logUi("badge:earned:list", {
        earnedCount: board.badges.filter((b) => b.earned).length,
        total: board.badges.length,
        isDev: board.isDev,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, board]);

  function changeTab(next: Tab) {
    if (next === tab) return;
    setDetailBadge(null);
    setTab(next);
    log.logInteraction("achievement:tab:change", { tab: next });
  }

  function openDetail(entry: BadgeBoardEntry) {
    setDetailBadge(entry);
    log.logUi("badge:detail:open", {
      badgeType: entry.badgeType,
      earned: entry.earned,
      count: entry.count,
    });
  }

  const recent = summary.recent.slice(0, 3);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="achievements-sheet"
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

        {/* Tabs */}
        <div className="mt-3 flex gap-1 px-5">
          {(["badges", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => changeTab(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors",
                tab === t
                  ? "bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                  : "bg-[var(--bg-card)] text-[var(--ink-3)]",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <SheetBody className="grid gap-4 px-5">
          {tab === "badges" ? (
            detailBadge ? (
              <BadgeDetail
                entry={detailBadge}
                onBack={() => setDetailBadge(null)}
              />
            ) : (
              <>
                <section className="grid gap-2">
                  <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    Badges
                  </h3>
                  {board ? (
                    <BadgeBoard badges={board.badges} onSelect={openDetail} />
                  ) : (
                    <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
                      Loading badges…
                    </p>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    Recent
                  </h3>
                  {recent.length > 0 ? (
                    <ul className="grid gap-2">
                      {recent.map((event) => (
                        <HistoryRow key={event._id} event={event} />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
                      No achievements yet. Check in daily and create Missions to
                      earn points.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => changeTab("history")}
                    className="w-fit text-xs font-semibold text-[var(--flag)] underline"
                  >
                    View full history
                  </button>
                </section>
              </>
            )
          ) : (
            <section className="grid gap-2">
              <h3 className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
                Point history
              </h3>
              {history && history.length > 0 ? (
                <ul className="grid gap-2">
                  {history.map((event) => (
                    <HistoryRow key={event._id} event={event} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-[var(--bg-card)] p-3 text-sm text-[var(--ink-3)]">
                  {history ? "No achievements yet." : "Loading history…"}
                </p>
              )}
            </section>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
