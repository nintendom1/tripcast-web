import { Fragment, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { TripCard } from "../../convex/tripcastApi";
import { TripListRow } from "./TripListRow";
import type { TravelerTripsStatus } from "./useTravelerTrips";

export type TripListProps = {
  cards: TripCard[];
  status: TravelerTripsStatus;
  /** Whether a search or lifecycle filter is applied (picks the empty-state wording). */
  filtered: boolean;
  highlightedId: string | null;
  viewingTripId: string | null;
  onHighlight: (card: TripCard) => void;
  onLoadMore: () => void;
  renderCardMenu?: (card: TripCard) => ReactNode;
  /** Rendered right after the highlighted card's row, so its actions follow it in tab order. */
  renderDetail?: (card: TripCard) => ReactNode;
};

/** ArrowUp/ArrowDown (and Home/End) move focus between the card buttons. */
function moveRowFocus(event: KeyboardEvent<HTMLUListElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-trip-row]"));
  const index = rows.findIndex((row) => row === document.activeElement);
  if (index === -1 || rows.length === 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
  rows[next]?.focus();
}

/** The paginated card list with its loading, empty and "Load more" states. Presentational: no data calls. */
export function TripList({
  cards,
  status,
  filtered,
  highlightedId,
  viewingTripId,
  onHighlight,
  onLoadMore,
  renderCardMenu,
  renderDetail,
}: TripListProps) {
  if (status === "loading-first") {
    return (
      <div role="status" aria-label="Loading trips" className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--meter-track)]" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--ink-3)]">
        {filtered ? "No trips match your search." : "No trips yet."}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <ul aria-label="Trips" className="grid gap-2" onKeyDown={moveRowFocus}>
        {cards.map((card) => (
          <Fragment key={card.tripId}>
            <TripListRow
              card={card}
              highlighted={card.tripId === highlightedId}
              viewing={card.tripId === viewingTripId}
              onHighlight={onHighlight}
              menu={renderCardMenu?.(card)}
            />
            {card.tripId === highlightedId && renderDetail ? <li className="list-none">{renderDetail(card)}</li> : null}
          </Fragment>
        ))}
      </ul>
      {status === "ready" || status === "loading-more" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={status === "loading-more"}
          onClick={onLoadMore}
        >
          {status === "loading-more" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
