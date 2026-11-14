import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { TripCard, TripLifecycle } from "../../convex/tripcastApi";

export const LIFECYCLE_LABELS: Record<TripLifecycle, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
};

export type TripListRowProps = {
  card: TripCard;
  /** The card is the highlighted preview candidate. */
  highlighted: boolean;
  /** The card is the trip being viewed on this device. */
  viewing: boolean;
  onHighlight: (card: TripCard) => void;
  /** Edit and lifecycle menu supplied by the caller; rendered beside the card, never inside its button. */
  menu?: ReactNode;
};

/** One thin catalog card. Tapping only highlights it; a deleting trip is inert and shows "Deleting…". */
export function TripListRow({ card, highlighted, viewing, onHighlight, menu }: TripListRowProps) {
  const deleting = card.deletingAt !== undefined;
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-[var(--ink-1)]">{card.title}</span>
        {card.isCurrent ? <Tag>Current</Tag> : null}
        {viewing ? <Tag>Viewing</Tag> : null}
      </span>
      <span className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
        <span>{deleting ? "Deleting…" : LIFECYCLE_LABELS[card.lifecycle]}</span>
        {card.destinationSummary ? <span className="truncate">{card.destinationSummary}</span> : null}
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]",
        highlighted && "border-[var(--ink-1)]",
      )}
    >
      {deleting ? (
        <div className="grid min-w-0 flex-1 gap-0.5 px-3 py-2 opacity-60">{body}</div>
      ) : (
        <button
          type="button"
          data-trip-row=""
          aria-pressed={highlighted}
          onClick={() => onHighlight(card)}
          className="grid min-w-0 flex-1 gap-0.5 rounded-xl px-3 py-2 text-left"
        >
          {body}
        </button>
      )}
      {deleting ? null : menu}
    </li>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-[var(--meter-track)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
      {children}
    </span>
  );
}
