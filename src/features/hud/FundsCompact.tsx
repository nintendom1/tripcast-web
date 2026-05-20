import * as React from "react";
import { cn } from "@/lib/utils";
import { TERMS } from "../../copy/terminology";

export interface FundsCompactProps {
  remainingUsd: number;
  startingBudgetUsd: number;
  budgetLabel?: string;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Circular-dial funds chip for the HUD row.
 *
 * Replaces the legacy TravelFundsCard's full-width meter. Tap opens the full
 * Funds sheet (Part 7); without an `onClick` the chip is non-interactive
 * (Follower see-only).
 */
export function FundsCompact({
  remainingUsd,
  startingBudgetUsd,
  budgetLabel,
  onClick,
  className,
  ariaLabel,
}: FundsCompactProps) {
  const left = remainingUsd;
  const over = left < 0;
  const pct = startingBudgetUsd > 0
    ? over
      ? Math.min(100, (-left / startingBudgetUsd) * 100)
      : Math.max(0, Math.min(100, (left / startingBudgetUsd) * 100))
    : 0;

  const r = 11;
  const c = 2 * Math.PI * r;
  const offset = c - (c * pct) / 100;
  const trackStroke = over ? "var(--flag)" : "var(--green)";

  const amountText = over
    ? `-$${Math.abs(left).toFixed(0)}`
    : `$${left.toFixed(0)}`;

  const captionText = over
    ? "OVER BUDGET"
    : `OF $${Math.round(startingBudgetUsd)}`;

  const content = (
    <>
      <div className="relative h-7 w-7 shrink-0">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <circle cx="14" cy="14" r={r} fill="none" stroke="var(--meter-track)" strokeWidth="3" />
          <circle
            cx="14"
            cy="14"
            r={r}
            fill="none"
            stroke={trackStroke}
            strokeWidth="3"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 14 14)"
            strokeLinecap="round"
          />
        </svg>
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center font-[var(--font-mono)] text-[8px] font-bold text-[var(--ink-1)]"
          aria-hidden="true"
        >
          $
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-start text-left leading-tight">
        <span
          className={cn(
            "font-[var(--font-display)] text-[13px] font-extrabold",
            over ? "text-[var(--flag)]" : "text-[var(--ink-1)]",
          )}
        >
          {amountText}
        </span>
        <span className="font-[var(--font-mono)] text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {budgetLabel ?? captionText}
        </span>
      </div>
    </>
  );

  const sharedClass = cn(
    "flex items-center gap-2 rounded-full bg-[var(--bg-card)] py-1 pl-1 pr-3 shadow-[var(--shadow-card)]",
    onClick ? "transition-transform active:scale-[0.98]" : "cursor-default",
    className,
  );

  const resolvedAriaLabel = ariaLabel ?? `${TERMS.funds}. ${amountText} ${captionText.toLowerCase()}.`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={resolvedAriaLabel} className={sharedClass}>
        {content}
      </button>
    );
  }

  return (
    <div role="group" aria-label={resolvedAriaLabel} className={sharedClass}>
      {content}
    </div>
  );
}
