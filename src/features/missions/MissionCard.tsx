import type { Mission } from "../../convex/tripcastApi";

type Props = {
  Mission: Mission;
  isOwn?: boolean;
  isHighlighted?: boolean;
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

export default function MissionCard({ Mission, isOwn, isHighlighted, onClick }: Props) {
  const statusLabel = STATUS_LABELS[Mission.status] ?? Mission.status;
  const statusColor = STATUS_COLORS[Mission.status] ?? "bg-slate-100 text-slate-600";

  return (
    <button
      type="button"
      data-mission-id={Mission._id}
      className={`w-full text-left p-3 pr-10 rounded-lg border bg-white hover:bg-slate-50 transition-all flex flex-col gap-1.5 ${
        isHighlighted ? "border-amber-400 ring-2 ring-amber-300 bg-amber-50" : "border-slate-200"
      }`}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-navy line-clamp-2">{Mission.title}</span>
        <span className={`max-w-[48%] truncate text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {Mission.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{Mission.description}</p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {Mission.locationLabel && (
          <span>📍 {Mission.locationLabel}</span>
        )}
        {Mission.estimatedDurationMinutes && (
          <span>⏱ {Mission.estimatedDurationMinutes} min</span>
        )}
        {Mission.estimatedCostUsd !== undefined && (
          <span>💰 ${Mission.estimatedCostUsd.toFixed(0)}</span>
        )}
        {Mission.estimatedEnergyImpact && (
          <span>⚡ {Mission.estimatedEnergyImpact} energy</span>
        )}
        {isOwn && Mission.status === "proposed" && (
          <span className="text-slate-400 italic">Awaiting review</span>
        )}
      </div>
    </button>
  );
}
