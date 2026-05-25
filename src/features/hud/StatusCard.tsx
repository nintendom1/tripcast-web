import * as React from "react";
import { ChevronRight, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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
  valueLabel?: string;
  color?: string;
}

export interface StatusCardProps {
  activityLabel?: string | null;
  activityEmoji?: string | null;
  activitySince?: string | null;
  statusMeta?: string | null;
  clockLabel?: string | null;
  meters: StatusCardMeter[];
  staleInfo?: string | null;
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
 * — Traveler mode only; for Followers the card is non-interactive and the
 * chevron is hidden.
 */
export function StatusCard({
  activityLabel,
  activityEmoji,
  activitySince,
  statusMeta,
  clockLabel,
  meters,
  staleInfo,
  interactive = false,
  onActivate,
  className,
  ariaLabel = "Traveler status",
}: StatusCardProps) {
  const hasActivity = Boolean(activityLabel);
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/70 text-[var(--ink-1)] shadow-sm"
          style={{
            background: "color-mix(in oklab, var(--bg-card) 78%, var(--flag) 10%)",
          }}
          aria-hidden="true"
        >
          {activityEmoji ? (
            <span className="text-2xl leading-none">{activityEmoji}</span>
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight text-[var(--ink-1)]">
                {activityLabel ?? "Status update"}
              </div>
              {(activitySince || statusMeta) ? (
                <div className="mt-0.5 min-w-0 truncate text-xs font-medium text-[var(--ink-3)]">
                  {[activitySince, statusMeta].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {clockLabel ? (
                <span className="rounded-full bg-[var(--meter-track)] px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-semibold text-[var(--ink-2)]">
                  {clockLabel}
                </span>
              ) : null}
              {staleInfo ? (
                <span
                  aria-label={staleInfo}
                  title={staleInfo}
                  className="grid h-6 w-6 place-items-center rounded-full bg-[color-mix(in_oklab,var(--amber)_18%,var(--bg-card))] text-[var(--amber)]"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {meters.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {meters.map((meter) => {
            const max = meter.max ?? 100;
            const pct = Math.min(100, Math.max(0, (meter.value / max) * 100));
            const tier = tierFor((meter.value / max) * 100);
            const color = meter.color ?? TIER_COLORS[tier];
            return (
              <div key={meter.label} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 items-center justify-between gap-1 font-[var(--font-mono)] text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-[var(--ink-3)]">
                  <span className="min-w-0 truncate">{meter.label}</span>
                  {meter.valueLabel ? (
                    <span className="shrink-0 tracking-normal" style={{ color }}>
                      {meter.valueLabel}
                    </span>
                  ) : null}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--meter-track)]">
                  <span
                    className="block h-full rounded-full transition-[width]"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const sharedClass = cn(
    "relative flex items-center gap-3 rounded-lg bg-[color-mix(in_oklab,var(--bg-card)_88%,transparent)] px-4 py-4 text-left shadow-[var(--shadow-card)] backdrop-blur-md",
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
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-[var(--ink-3)]"
        />
      </button>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className={sharedClass}>
      {body}
    </div>
  );
}
