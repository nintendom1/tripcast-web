import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";
import type { TripCard, TripLifecycle } from "../../convex/tripcastApi";
import { useDeleteTripCall } from "./DeleteTripDialog";
import { tripErrorInfo } from "./tripSwitchState";

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
  /** Id of the card's detail panel while it is shown: the card's button controls it. */
  detailId?: string;
};

/**
 * True when the server says a trip's delete stopped without finishing (`deleteFailed` on a deleting card). The field is
 * newer than the API type on this branch, so it is read defensively.
 */
export function isDeleteFailed(card: TripCard): boolean {
  return card.deletingAt !== undefined && (card as TripCard & { deleteFailed?: boolean }).deleteFailed === true;
}

/**
 * A card that cannot be opened, switched to, edited or deleted, with the word that says why: "Deleting…" while its
 * delete runs, "Upgrading…" while an operator rewrites its rows (`upgradingAt`); `null` for a usable card.
 */
export function inertCardLabel(card: TripCard): string | null {
  if (card.deletingAt !== undefined) return "Deleting…";
  if (card.upgradingAt !== undefined) return "Upgrading…";
  return null;
}

/** Calls `deleteTrip` again for `card`'s trip with the same arguments the delete dialog sends. */
function RetryDelete({ card }: { card: TripCard }) {
  const deleteTripCall = useDeleteTripCall();
  const online = useOnlineStatus();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    setWorking(true);
    setError(null);
    try {
      await deleteTripCall(card);
    } catch (reason) {
      setError(tripErrorInfo(reason, "Could not retry the delete. Try again.").message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 pr-2">
      <button
        type="button"
        disabled={working || !online}
        onClick={() => void retry()}
        className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--ink-danger)] transition-colors hover:bg-[var(--bg-danger)] disabled:opacity-50"
      >
        {working ? "Retrying…" : "Retry"}
      </button>
      {error ? (
        <span role="alert" className="max-w-40 text-right text-[10px] text-[var(--ink-danger)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One thin catalog card. Tapping only highlights it; a deleting or upgrading trip is inert (it cannot be highlighted,
 * opened, switched to, edited or deleted) and shows "Deleting…" or "Upgrading…", or "Delete did not finish" with a
 * Retry when the server says the delete stopped.
 */
export function TripListRow({ card, highlighted, viewing, onHighlight, menu, detailId }: TripListRowProps) {
  const inertLabel = inertCardLabel(card);
  const inert = inertLabel !== null;
  const deleteFailed = isDeleteFailed(card);
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-[var(--ink-1)]">{card.title}</span>
        {card.isCurrent ? <Tag>Current</Tag> : null}
        {viewing ? <Tag>Viewing</Tag> : null}
      </span>
      <span className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
        <span>{deleteFailed ? "Delete did not finish" : (inertLabel ?? LIFECYCLE_LABELS[card.lifecycle])}</span>
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
      {inert ? (
        <div className="grid min-w-0 flex-1 gap-0.5 px-3 py-2 opacity-60">{body}</div>
      ) : (
        <button
          type="button"
          data-trip-row=""
          aria-pressed={highlighted}
          aria-controls={detailId}
          onClick={() => onHighlight(card)}
          className="grid min-w-0 flex-1 gap-0.5 rounded-xl px-3 py-2 text-left"
        >
          {body}
        </button>
      )}
      {deleteFailed ? <RetryDelete card={card} /> : null}
      {inert ? null : menu}
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
