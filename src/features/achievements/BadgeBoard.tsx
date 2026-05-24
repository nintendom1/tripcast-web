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
        "flex h-16 w-full items-center gap-3 rounded-xl border px-3 text-left shadow-sm transition-transform active:scale-[0.98]",
        earned
          ? cn(BADGE_COLOR[entry.badgeType], "shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)]")
          : "border-dashed border-[var(--meter-track)] bg-[var(--bg-card)] text-[var(--ink-3)] opacity-60",
      )}
    >
      <span className={cn("text-2xl leading-none", !earned && "grayscale")} aria-hidden>
        {earned ? entry.emoji : "🏆"}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {earned ? entry.name : "???"}
      </span>
      {earned && entry.count > 1 ? (
        <span className="shrink-0 rounded-full bg-black/10 px-1.5 font-[var(--font-mono)] text-[10px] font-bold">
          ×{entry.count}
        </span>
      ) : null}
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
      {badges.map((entry) => (
        <BadgeChip key={entry.badgeType} entry={entry} onSelect={onSelect} />
      ))}
    </div>
  );
}

export { BADGE_COLOR };
