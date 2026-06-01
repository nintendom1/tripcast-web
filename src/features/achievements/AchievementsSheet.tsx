import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Award, ChevronLeft, Lock, Medal } from "lucide-react";

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
  SheetTitle,
} from "../../components/ui/sheet";
import { cn } from "@/lib/utils";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import BadgeBoard, { BADGE_COLOR } from "./BadgeBoard";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import { TERMS } from "../../copy/terminology";

type Props = {
  open: boolean;
  summary: ScoreSummary | null;
  token: string;
  onOpenChange: (open: boolean) => void;
};

type Tab = "badges" | "history";

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function getLevelProgress(totalPoints: number) {
  const safeTotal = Math.max(0, totalPoints);
  const level = Math.floor(safeTotal / 100) + 1;
  const progress = safeTotal % 100;
  return {
    level,
    progress,
    nextLevel: level + 1,
  };
}

function PointsHero({ totalPoints }: { totalPoints: number }) {
  const { level, progress, nextLevel } = getLevelProgress(totalPoints);
  return (
    <section className="relative px-5 pt-4">
      <div
        aria-hidden="true"
        className="awards-top-glow pointer-events-none absolute inset-x-6 -top-8 h-28 rounded-b-[40px]"
      />
      <div className="awards-hero-card relative grid gap-4 rounded-3xl p-4 text-center">
        <div className="grid gap-1">
          <p className="font-[var(--font-display)] text-4xl font-extrabold leading-none text-[var(--flag)]">
            {totalPoints.toLocaleString()} {totalPoints === 1 ? "Point" : "Points"}
          </p>
          <p className="text-sm font-semibold text-[var(--ink-2)]">
            Boost your score with daily logins, badges, mission ideas, and votes.
          </p>
        </div>

        <div className="grid gap-2 text-left">
          <div
            className="awards-progress-track relative h-8 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`Level ${level}, ${progress}% to Level ${nextLevel}`}
          >
            <div
              className="awards-progress-fill h-full rounded-full"
              style={{ width: `${progress}%` }}
            />
            <span className="absolute inset-0 flex items-center px-4 font-[var(--font-mono)] text-[11px] font-extrabold text-[var(--ink-1)]">
              Level {level} • {progress}% to Level {nextLevel}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HistoryRow({ event }: { event: AchievementEvent }) {
  const { awards: awardsPersonality } = useSheetPersonalities();
  const isNew = event.seenAt === undefined;
  return (
    <li className="awards-card-raised flex items-center gap-3 rounded-2xl p-4">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
        style={{ background: awardsPersonality.color }}
      >
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
      {/* Points are shown only in the point log, never on Badge chips/detail. */}
      <div className="grid shrink-0 justify-items-end gap-0.5">
        <span className="font-[var(--font-mono)] text-sm font-extrabold text-[var(--flag)]">
          +{event.points}
        </span>
        <span className="font-[var(--font-mono)] text-[10px] font-semibold text-[var(--ink-3)]">
          {formatWhen(event.createdAt)}
        </span>
      </div>
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
            : "awards-soft-panel border-dashed border-[var(--meter-track)] text-[var(--ink-3)]",
          earned && "awards-badge-card",
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
  const { awards: awardsPersonality } = useSheetPersonalities();
  const log = useDebugLogger(
    "AchievementsSheet",
    "src/features/achievements/AchievementsSheet.tsx",
  );
  const [tab, setTab] = useState<Tab>("badges");
  const [detailBadge, setDetailBadge] = useState<BadgeBoardEntry | null>(null);
  const activeView = detailBadge ? "badge-detail" : tab;
  useActiveUiContext(open, {
    sheetName: "AchievementsSheet",
    label: TERMS.awards,
    view: activeView,
    source: "achievements-chip",
    sourceLabel: "Badge chip",
    file: "src/features/achievements/AchievementsSheet.tsx",
  }, { boundsSelector: "[data-role='achievements-sheet']" });

  const board = useQuery(
    tripcastApi.badges.getMyBadges,
    open && summary !== null ? { token } : "skip",
  );
  const catalog = useQuery(
    tripcastApi.badges.listBadgeDefinitions,
    open ? { token } : "skip",
  );
  const history = useQuery(
    tripcastApi.scoring.listAchievementHistory,
    open && tab === "history" && summary !== null ? { token } : "skip",
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
    if (!open) return;
    if (board === null) {
      log.warn("badge:earned:list:missing", "query", { message: "Badge board returned null" });
    } else if (board) {
      log.logUi("badge:earned:list", {
        earnedCount: board.badges.filter((b) => b.earned).length,
        total: board.badges.length,
        isDev: board.isDev,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, board]);

  // Compute the list of badges to display. If the user has a board (earned badges), use it.
  // Otherwise, fallback to the full catalog shown as unearned (locked).
  const displayBadges = board?.badges ?? catalog?.map((def) => ({
    ...def,
    earned: false,
    count: 0,
    awards: [],
  }));

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

  const recent = summary?.recent.slice(0, 3) ?? [];
  const totalPoints = summary?.total ?? 0;
  const isDev = summary?.isDev ?? false;
  const isBoardLoading = open && summary !== null && board === undefined;
  const isCatalogLoading = open && catalog === undefined;

  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        data-role="achievements-sheet"
        className={cn(
          "awards-sheet-surface z-[10] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)]",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-0 h-1 rounded-t-xl"
          style={{ background: awardsPersonality.color }}
        />
        <div
          className="flex items-start justify-between gap-3 px-5 pb-2 pt-3"
          style={{
            background: `linear-gradient(180deg, ${awardsPersonality.bg} 0%, var(--bg-paper) 100%)`,
          }}
        >
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
                style={{ background: awardsPersonality.color }}
              >
                <Medal className="h-4 w-4" />
              </span>
              <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">
                Trophy Case
              </SheetTitle>
            </div>
            {isDev ? (
              <p
                className="text-xs font-semibold"
                style={{ color: awardsPersonality.color }}
              >
                Testing Follower achievements as Traveler
              </p>
            ) : null}
          </div>
          <SheetCloseButton />
        </div>

        <PointsHero totalPoints={totalPoints} />

        {/* Tabs */}
        <div className="mt-4 flex gap-1 px-5">
          {(["badges", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => changeTab(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors",
                tab === t
                  ? "bg-[var(--flag)] text-[var(--ink-on-brand)] shadow-sm"
                  : "bg-[var(--bg-card)] text-[var(--ink-3)] shadow-sm",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <SheetBody className="grid gap-5 px-5">
          {tab === "badges" ? (
            detailBadge ? (
              <BadgeDetail
                entry={detailBadge}
                onBack={() => setDetailBadge(null)}
              />
            ) : (
              <>
                <section className="grid gap-2">
                  <h3 className="font-[var(--font-display)] text-xl font-bold text-[var(--ink-1)]">
                    Badges
                  </h3>
                  {isBoardLoading || isCatalogLoading ? (
                    <p className="awards-soft-panel rounded-2xl p-4 text-sm text-[var(--ink-3)]">
                      Loading badges…
                    </p>
                  ) : displayBadges && displayBadges.length > 0 ? (
                    <BadgeBoard badges={displayBadges} onSelect={openDetail} />
                  ) : (
                    <p className="awards-soft-panel rounded-2xl p-4 text-sm text-[var(--ink-3)]">
                      No badges available.
                    </p>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="font-[var(--font-display)] text-xl font-bold text-[var(--ink-1)]">
                    Recent
                  </h3>
                  {recent.length > 0 ? (
                    <ul className="grid gap-2">
                      {recent.map((event) => (
                        <HistoryRow key={event._id} event={event} />
                      ))}
                    </ul>
                  ) : (
                    <p className="awards-soft-panel rounded-2xl p-4 text-sm text-[var(--ink-3)]">
                      No achievements yet. Check in daily and create Missions to
                      earn points.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => changeTab("history")}
                    className="awards-soft-action w-fit rounded-full px-3 py-1.5 text-xs font-bold text-[var(--flag)]"
                  >
                    View full history
                  </button>
                </section>
              </>
            )
          ) : (
            <section className="grid gap-2">
              <h3 className="font-[var(--font-display)] text-xl font-bold text-[var(--ink-1)]">
                Point history
              </h3>
              {history && history.length > 0 ? (
                <ul className="grid gap-2">
                  {history.map((event) => (
                    <HistoryRow key={event._id} event={event} />
                  ))}
                </ul>
              ) : (
                <p className="awards-soft-panel rounded-2xl p-4 text-sm text-[var(--ink-3)]">
                  {history !== undefined ? "No achievements yet." : "Loading history…"}
                </p>
              )}
            </section>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
