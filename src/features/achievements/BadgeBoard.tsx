import { Lock } from "lucide-react";

import type { BadgeBoardEntry, BadgeType } from "../../convex/tripcastApi";
import { cn } from "@/lib/utils";

// Per-Badge chip color. Earned chips use the tinted background; unachieved
// chips fall back to a neutral greyed treatment regardless of type.
const BADGE_COLOR: Record<BadgeType, string> = {
  life_changing: "border-[var(--plum)] bg-[color-mix(in_oklab,var(--plum)_18%,var(--bg-card))] text-[var(--ink-1)]",
  tasty: "border-[var(--amber)] bg-[color-mix(in_oklab,var(--amber)_18%,var(--bg-card))] text-[var(--ink-1)]",
  entertained: "border-[var(--flag)] bg-[color-mix(in_oklab,var(--flag)_18%,var(--bg-card))] text-[var(--ink-1)]",
  refreshing: "border-[var(--teal)] bg-[color-mix(in_oklab,var(--teal)_18%,var(--bg-card))] text-[var(--ink-1)]",
  popular: "border-[var(--plum)] bg-[color-mix(in_oklab,var(--plum)_18%,var(--bg-card))] text-[var(--ink-1)]",
  wayfinder: "border-[var(--teal)] bg-[color-mix(in_oklab,var(--teal)_18%,var(--bg-card))] text-[var(--ink-1)]",
  clutch_call: "border-[var(--flag)] bg-[color-mix(in_oklab,var(--flag)_18%,var(--bg-card))] text-[var(--ink-1)]",
  photo_worthy: "border-[var(--plum)] bg-[color-mix(in_oklab,var(--plum)_18%,var(--bg-card))] text-[var(--ink-1)]",
  budget_saver: "border-[var(--green)] bg-[color-mix(in_oklab,var(--green)_18%,var(--bg-card))] text-[var(--ink-1)]",
  local_legend: "border-[var(--amber)] bg-[color-mix(in_oklab,var(--amber)_18%,var(--bg-card))] text-[var(--ink-1)]",
};

type BadgeChipProps = {
  entry: BadgeBoardEntry;
  onSelect: (entry: BadgeBoardEntry) => void;
};

function BadgeChip({ entry, onSelect }: BadgeChipProps) {
  const earned = entry.earned;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      aria-label={earned ? `${entry.name} badge, earned` : "Locked badge"}
      className={cn(
        "group flex min-h-20 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-transform active:scale-[0.98]",
        earned
          ? cn(
              BADGE_COLOR[entry.badgeType],
              "awards-badge-card",
            )
          : "awards-badge-locked border-dashed border-[var(--meter-track)] text-[var(--ink-3)] opacity-70",
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl leading-none",
          earned
            ? "awards-badge-icon"
            : "bg-[var(--bg-card)] grayscale",
        )}
        aria-hidden
      >
        {earned ? entry.emoji : "🏆"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--ink-1)]">
          {earned ? entry.name : "???"}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold text-[var(--ink-3)]">
          {earned ? "Unlocked" : "Locked"}
        </span>
      </span>
      {earned && entry.count > 1 ? (
        <span className="shrink-0 rounded-full bg-black/10 px-2 font-[var(--font-mono)] text-[10px] font-bold text-[var(--ink-1)]">
          ×{entry.count}
        </span>
      ) : (
        !earned && <Lock className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
      )}
    </button>
  );
}

type BadgeBoardProps = {
  badges: BadgeBoardEntry[];
  onSelect: (entry: BadgeBoardEntry) => void;
};

/**
 * Grid of consistently-sized colored Badge chips. Uses an auto-fill grid so it
 * renders 2 columns at typical mobile sheet widths (~390px) and collapses to 1
 * column when the sheet is narrower. Never shows points.
 */
export default function BadgeBoard({ badges, onSelect }: BadgeBoardProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {badges.map((entry) => (
        <BadgeChip key={entry.badgeType} entry={entry} onSelect={onSelect} />
      ))}
    </div>
  );
}

export { BADGE_COLOR };
