import type { Mission } from "../../convex/tripcastApi";
import AttributionPublicLine from "../attributions/AttributionPublicLine";
import { ReactionSection } from "../../components/ui/ReactionSection";
import { CheckSquare, Clock, DollarSign, MapPin, RadioTower, Trophy, Zap } from "lucide-react";
import { useSheetPersonalities } from "../redesign/sheetPersonality";

type Props = {
  Mission: Mission;
  token?: string;
  isOwn?: boolean;
  isHighlighted?: boolean;
  onClick?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  visible: "Unlocked",
  planned: "Unlocked",
  in_progress: "Active",
  completed: "Completed",
  dropped: "Dropped",
};

const STATUS_STYLES: Record<string, { text: string; background: string; border: string }> = {
  proposed: { text: "var(--ink-3)", background: "var(--bg-paper-2)", border: "var(--line-soft)" },
  visible: { text: "var(--meadow-gold)", background: "color-mix(in oklab, var(--meadow-gold) 14%, transparent)", border: "color-mix(in oklab, var(--meadow-gold) 40%, transparent)" },
  planned: { text: "var(--meadow-gold)", background: "color-mix(in oklab, var(--meadow-gold) 14%, transparent)", border: "color-mix(in oklab, var(--meadow-gold) 40%, transparent)" },
  in_progress: { text: "var(--flag)", background: "color-mix(in oklab, var(--flag) 12%, transparent)", border: "color-mix(in oklab, var(--flag) 35%, transparent)" },
  completed: { text: "var(--green)", background: "color-mix(in oklab, var(--green) 12%, transparent)", border: "color-mix(in oklab, var(--green) 32%, transparent)" },
  dropped: { text: "var(--ink-3)", background: "var(--bg-paper-2)", border: "var(--line-soft)" },
};

export default function MissionCard({ Mission, token, isOwn, isHighlighted, onClick }: Props) {
  const { missions: missionPersonality, votes: votesPersonality } = useSheetPersonalities();
  const isMystery = Mission.source === "mystery";
  const statusLabel = STATUS_LABELS[Mission.status] ?? Mission.status;
  const statusStyle = isMystery
    ? { text: "#18181b", background: "rgba(24,24,27,0.08)", border: "rgba(24,24,27,0.28)" }
    : STATUS_STYLES[Mission.status] ?? STATUS_STYLES.proposed;
  const iconColor = isMystery ? "#09090b" : missionPersonality.color;

  return (
    <div
      role="button"
      tabIndex={0}
      data-mission-id={Mission._id}
      className={`group relative flex w-full items-start gap-3 rounded-2xl border bg-[var(--bg-card)] p-3 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 cursor-pointer ${
        isHighlighted ? "ring-2" : ""
      }`}
      style={{
        borderColor: isHighlighted ? iconColor : isMystery ? "rgba(24,24,27,0.32)" : "var(--line-soft)",
        background: isHighlighted
          ? isMystery ? "rgba(24,24,27,0.08)" : missionPersonality.bg
          : "var(--bg-card)",
        boxShadow: isHighlighted
          ? `0 0 0 2px color-mix(in oklab, ${iconColor} 28%, transparent), var(--shadow-card)`
          : undefined,
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <span
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
        style={{
          color: iconColor,
          background: isMystery
            ? "color-mix(in oklab, #09090b 10%, var(--bg-paper))"
            : "color-mix(in oklab, var(--meadow-gold) 18%, var(--bg-paper))",
          borderColor: isMystery
            ? "rgba(24,24,27,0.36)"
            : "color-mix(in oklab, var(--meadow-gold) 45%, var(--line-soft))",
        }}
        aria-hidden="true"
      >
        {isMystery ? <RadioTower className="h-[18px] w-[18px]" /> : <Trophy className="h-[18px] w-[18px]" />}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 font-[var(--font-display)] text-sm font-extrabold leading-snug text-[var(--ink-1)] line-clamp-2">
            {Mission.title}
          </span>
          <span
            className="max-w-[48%] shrink-0 truncate rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap"
            style={{
              color: statusStyle.text,
              background: statusStyle.background,
              borderColor: statusStyle.border,
            }}
          >
            {statusLabel}
          </span>
        </span>

        {Mission.source === "route_vote" && (
          <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]"
            style={{
              color: votesPersonality.color,
              background: `color-mix(in oklab, ${votesPersonality.color} 12%, transparent)`,
            }}
          >
            <CheckSquare className="h-2.5 w-2.5" aria-hidden="true" />
            Via vote
          </span>
        )}

        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
          {Mission.description ? (
            <span className="text-xs leading-snug text-[var(--ink-2)] line-clamp-1 md:min-w-0 md:flex-1">
              {Mission.description}
            </span>
          ) : (
            <div className="hidden md:block md:flex-1" aria-hidden="true" />
          )}
          {token && (
            <ReactionSection
              targetId={Mission._id}
              targetType="mission"
              reactions={Mission.reactions}
              token={token}
              className="flex justify-end md:shrink-0"
            />
          )}
        </div>

        {token ? (
          <AttributionPublicLine
            token={token}
            sourceType="mission"
            sourceId={Mission._id}
            className="text-xs text-[var(--ink-3)]"
          />
        ) : null}

        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-3)]">
          {Mission.locationLabel && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" /> {Mission.locationLabel}
            </span>
          )}
          {Mission.estimatedDurationMinutes && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" /> {Mission.estimatedDurationMinutes} min
            </span>
          )}
          {Mission.estimatedCostUsd !== undefined && (
            <span className="inline-flex items-center gap-1">
              <DollarSign className="h-3 w-3" aria-hidden="true" /> {Mission.estimatedCostUsd.toFixed(0)}
            </span>
          )}
          {Mission.estimatedEnergyImpact && (
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" aria-hidden="true" /> {Mission.estimatedEnergyImpact} energy
            </span>
          )}
          {isOwn && Mission.status === "proposed" && (
            <span className="italic text-[var(--ink-3)]">Awaiting review</span>
          )}
        </span>
      </span>
    </div>
  );
}
