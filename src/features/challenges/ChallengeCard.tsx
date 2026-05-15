import type { Challenge } from "../../convex/tripcastApi";

type Props = {
  challenge: Challenge;
  isOwn?: boolean;
  onClick?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Pending review",
  visible: "Accepted",
  planned: "Accepted",
  in_progress: "In progress",
  completed: "Completed",
  dropped: "Dropped",
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-slate-100 text-slate-600",
  visible: "bg-blue-50 text-blue-700",
  planned: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-green-50 text-green-700",
  dropped: "bg-slate-100 text-slate-500",
};

export default function ChallengeCard({ challenge, isOwn, onClick }: Props) {
  const statusLabel = STATUS_LABELS[challenge.status] ?? challenge.status;
  const statusColor = STATUS_COLORS[challenge.status] ?? "bg-slate-100 text-slate-600";

  return (
    <button
      type="button"
      className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex flex-col gap-1.5"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-navy line-clamp-2">{challenge.title}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {challenge.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{challenge.description}</p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {challenge.locationLabel && (
          <span>📍 {challenge.locationLabel}</span>
        )}
        {challenge.estimatedDurationMinutes && (
          <span>⏱ {challenge.estimatedDurationMinutes} min</span>
        )}
        {challenge.estimatedCostUsd !== undefined && (
          <span>💰 ${challenge.estimatedCostUsd.toFixed(0)}</span>
        )}
        {challenge.estimatedEnergyImpact && (
          <span>⚡ {challenge.estimatedEnergyImpact} energy</span>
        )}
        {isOwn && challenge.status === "proposed" && (
          <span className="text-slate-400 italic">Awaiting review</span>
        )}
      </div>
    </button>
  );
}
