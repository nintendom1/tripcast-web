import * as React from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TERMS } from "../../copy/terminology";

export type Tier = "good" | "warn" | "bad";

function tierFor(value: number): Tier {
  if (value > 65) return "good";
  if (value > 35) return "warn";
  return "bad";
}

const TIER_COLORS: Record<Tier, string> = {
  good: "var(--green)",
  warn: "var(--amber)",
  bad: "var(--flag)",
};

export interface StatusCardMeter {
  label: string;
  value: number;
  max?: number;
  /** When true, render a small inline AUTO pill next to the label. */
  autoChip?: boolean;
}

export interface StatusCardProps {
  activityLabel?: string | null;
  activityEmoji?: string | null;
  activitySince?: string | null;
  meters: StatusCardMeter[];
  /** Show the chevron + treat the card as a button (Traveler taps to open State editor). */
  interactive?: boolean;
  onActivate?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * StatusCard replaces the legacy stacked TravelerStateCard + CurrentActivityCard.
 *
 * A single compact card surfaces the active activity (icon + label + relative time)
 * and three mini-meters (Energy / Stomach / Calm). Tap opens the full state editor
 * — Traveler mode only; for Support Crew the card is non-interactive and the
 * chevron is hidden.
 */
export function StatusCard({
  activityLabel,
  activityEmoji,
  activitySince,
  meters,
  interactive = false,
  onActivate,
  className,
  ariaLabel = "Traveler status",
}: StatusCardProps) {
  const hasActivity = Boolean(activityLabel);
  const body = (
    <>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[var(--ink-1)]"
        style={{
          background: "color-mix(in oklab, var(--ink-1) 8%, transparent)",
        }}
        aria-hidden="true"
      >
        {activityEmoji ? (
          <span className="text-lg leading-none">{activityEmoji}</span>
        ) : (
          <Sparkles className="h-[18px] w-[18px]" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1 truncate text-[13px] font-semibold text-[var(--ink-1)]">
          <span className="truncate">{activityLabel ?? "Idle"}</span>
          {activitySince ? (
            <span className="font-normal text-[var(--ink-3)]"> · {activitySince}</span>
          ) : null}
        </div>

        {meters.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {meters.map((meter) => {
              const max = meter.max ?? 100;
              const pct = Math.min(100, Math.max(0, (meter.value / max) * 100));
              const tier = tierFor((meter.value / max) * 100);
              return (
                <div key={meter.label} className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-1 font-[var(--font-mono)] text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    <span>{meter.label}</span>
                    {meter.autoChip ? (
                      <span
                        aria-label={TERMS.autoEstimated}
                        className="rounded-full bg-navy/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-navy"
                      >
                        {TERMS.autoEstimated}
                      </span>
                    ) : null}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]">
                    <span
                      className="block h-full rounded-full transition-[width]"
                      style={{ width: `${pct}%`, background: TIER_COLORS[tier] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {interactive ? (
        <ChevronRight
          aria-hidden="true"
          className="ml-1 h-4 w-4 shrink-0 text-[var(--ink-3)]"
        />
      ) : null}
    </>
  );

  const sharedClass = cn(
    "flex items-center gap-3 rounded-[18px] bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-[var(--shadow-card)]",
    interactive ? "transition-transform active:scale-[0.99]" : "cursor-default",
    className,
  );

  if (interactive && onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        aria-label={hasActivity ? `${ariaLabel} — ${activityLabel}` : ariaLabel}
        className={sharedClass}
      >
        {body}
      </button>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className={sharedClass}>
      {body}
    </div>
  );
}
