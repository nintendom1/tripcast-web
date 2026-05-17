import { formatUsd } from "./currency";

type TravelFundsMeterProps = {
  startingBudgetUsd: number;
  remainingUsd: number;
  variant?: "compact" | "full";
  label?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export default function TravelFundsMeter({
  startingBudgetUsd,
  remainingUsd,
  variant = "compact",
  label,
}: TravelFundsMeterProps) {
  const spent = startingBudgetUsd - remainingUsd;
  const overBudget = remainingUsd < 0;
  const noBudget = startingBudgetUsd <= 0;

  let fillPct = 0;
  let barColor = "bg-emerald-500";
  let textTone = "text-foreground";
  let stateLabel = "";

  if (noBudget) {
    fillPct = 0;
    barColor = "bg-slate-300";
    stateLabel = `Spent ${formatUsd(spent)}`;
  } else if (overBudget) {
    fillPct = clamp01(Math.abs(remainingUsd) / startingBudgetUsd) * 100;
    barColor = "bg-rose-500";
    textTone = "text-rose-600";
    stateLabel = `${formatUsd(remainingUsd)} over`;
  } else {
    fillPct = clamp01(remainingUsd / startingBudgetUsd) * 100;
    const ratio = remainingUsd / startingBudgetUsd;
    if (ratio < 0.25) {
      barColor = "bg-amber-500";
      textTone = "text-amber-700";
    } else {
      barColor = "bg-emerald-500";
    }
    stateLabel = `${formatUsd(remainingUsd)} left`;
  }

  const valueText = overBudget
    ? `${formatUsd(Math.abs(remainingUsd))} over budget`
    : noBudget
    ? `${formatUsd(spent)} spent, no budget set`
    : `${formatUsd(remainingUsd)} remaining of ${formatUsd(startingBudgetUsd)}`;

  const barHeight = variant === "full" ? "h-3" : "h-2";

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={startingBudgetUsd > 0 ? startingBudgetUsd : undefined}
      aria-valuenow={overBudget ? 0 : remainingUsd}
      aria-valuetext={valueText}
      className="flex flex-col gap-1 w-full"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs font-medium ${textTone}`}>
          💰 {stateLabel}
        </span>
        {!noBudget && (
          <span className="text-[10px] text-muted-foreground">
            of {formatUsd(startingBudgetUsd)}
          </span>
        )}
      </div>
      <div className={`w-full ${barHeight} rounded-full bg-slate-200 overflow-hidden`}>
        <div
          className={`${barHeight} ${barColor} transition-all`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      {label && variant === "full" && (
        <p className="text-[11px] text-muted-foreground italic truncate">{label}</p>
      )}
    </div>
  );
}
