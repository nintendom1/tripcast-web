import { useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetCloseButton, SheetContent, SheetGradientHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import type { TripCard, TripLifecycle } from "../../convex/tripcastApi";
import { useTripContext } from "../../providers/TripContextProvider";
import { useTripsPersonality } from "../redesign/sheetPersonality";
import { TripList } from "./TripList";
import { LIFECYCLE_LABELS } from "./TripListRow";
import { TripPreview } from "./TripPreview";
import { useTravelerTrips } from "./useTravelerTrips";
import { useTripPreview } from "./useTripPreview";

/**
 * Actions the trip pane renders only when supplied (the create, edit, lifecycle and shared-switch flows live
 * elsewhere). A prop that is absent renders nothing.
 */
export type TripPaneActions = {
  /** "Set as shared current" for the highlighted card. */
  onRequestSwitch?: (card: TripCard) => void;
  /** "Create trip". */
  onRequestCreate?: () => void;
  /** The card's edit and lifecycle menu. */
  renderCardMenu?: (card: TripCard) => ReactNode;
};

export type TripSwitcherSheetProps = TripPaneActions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives focus when the pane closes (the chip). */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const LIFECYCLES: TripLifecycle[] = ["planned", "in_progress", "completed", "archived"];

/**
 * Left slide-out (full height on mobile) to browse, search and preview the Traveler's trips and open one privately.
 * The list subscription and preview cache live in `TripCatalog`, which exists only while the pane is open.
 */
export function TripSwitcherSheet({
  open,
  onOpenChange,
  returnFocusRef,
  onRequestSwitch,
  onRequestCreate,
  renderCardMenu,
}: TripSwitcherSheetProps) {
  const personality = useTripsPersonality();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        initialFocus={searchRef}
        finalFocus={returnFocusRef}
        className="w-full max-w-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:w-3/4 sm:max-w-sm"
      >
        <SheetGradientHeader color={personality.color} bg={personality.bg}>
          <SheetTitle>Trips</SheetTitle>
          <SheetCloseButton />
        </SheetGradientHeader>
        <TripPaneBody
          searchRef={searchRef}
          onClose={() => onOpenChange(false)}
          onRequestSwitch={onRequestSwitch}
          onRequestCreate={onRequestCreate}
          renderCardMenu={renderCardMenu}
        />
      </SheetContent>
    </Sheet>
  );
}

type TripPaneBodyProps = TripPaneActions & {
  searchRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
};

function TripPaneBody({ searchRef, onClose, onRequestSwitch, onRequestCreate, renderCardMenu }: TripPaneBodyProps) {
  const { followerTrip, viewingTrip, viewingMode, returnToCurrent } = useTripContext();
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<TripLifecycle | null>(null);

  return (
    <SheetBody className="flex flex-col gap-3">
      {followerTrip ? (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          <span className="text-[var(--ink-3)]">Followers currently see: </span>
          <span className="font-semibold text-[var(--ink-1)]">{followerTrip.title}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="min-w-0 truncate text-[var(--ink-2)]">
          You are viewing: <span className="font-semibold text-[var(--ink-1)]">{viewingTrip?.title ?? "—"}</span>
        </p>
        {viewingMode === "private" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              returnToCurrent();
              onClose();
            }}
          >
            Return to current
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search trips"
          placeholder="Search trips"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {onRequestCreate ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRequestCreate}>
            Create trip
          </Button>
        ) : null}
      </div>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {LIFECYCLES.map((value) => {
          const active = lifecycle === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setLifecycle(active ? null : value)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                active
                  ? "border-transparent bg-[var(--ink-1)] text-[var(--ink-on-dark)]"
                  : "border-[var(--line-soft)] text-[var(--ink-3)] hover:bg-[var(--bg-card)]",
              )}
            >
              {LIFECYCLE_LABELS[value]}
            </button>
          );
        })}
      </div>

      <FeatureBoundary
        title="Trips could not load."
        message="The rest of TripCast is unaffected. Try again, or close this pane."
        fallbackClassName="grid gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-sm"
      >
        <TripCatalog
          search={search}
          lifecycle={lifecycle}
          onClose={onClose}
          onRequestSwitch={onRequestSwitch}
          renderCardMenu={renderCardMenu}
        />
      </FeatureBoundary>
    </SheetBody>
  );
}

type TripCatalogProps = Pick<TripPaneActions, "onRequestSwitch" | "renderCardMenu"> & {
  search: string;
  lifecycle: TripLifecycle | null;
  onClose: () => void;
};

/** Owns the ONE list subscription, the highlighted card and the one-shot preview. Mounted only while open. */
function TripCatalog({ search, lifecycle, onClose, onRequestSwitch, renderCardMenu }: TripCatalogProps) {
  const { viewingTripId } = useTripContext();
  const { cards, status, loadMore } = useTravelerTrips(search, lifecycle);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);

  const found = cards.find((card) => card.tripId === previewTripId) ?? null;
  // While a search or filter change reloads the first page `cards` is briefly empty: keep the last card seen so the
  // panel does not flash away.
  const [lastFound, setLastFound] = useState<TripCard | null>(null);
  if (found && found !== lastFound) setLastFound(found);
  const candidate = found ?? (status === "loading-first" && lastFound?.tripId === previewTripId ? lastFound : null);
  const previewable = candidate !== null && candidate.deletingAt === undefined;
  const preview = useTripPreview(
    candidate && previewable ? { tripId: candidate.tripId, previewVersion: candidate.previewVersion } : null,
  );

  const panel = (card: TripCard) => (
    <section
      aria-label={`Preview of ${card.title}`}
      className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper)] p-3"
    >
      <h3 className="truncate text-sm font-semibold text-[var(--ink-1)]">{card.title}</h3>
      {card.deletingAt !== undefined ? (
        <p className="text-sm text-[var(--ink-3)]">Deleting…</p>
      ) : (
        <>
          <TripPreview state={preview} />
          <CandidateActions
            card={card}
            isViewed={card.tripId === viewingTripId}
            onClose={onClose}
            onRequestSwitch={onRequestSwitch}
          />
        </>
      )}
    </section>
  );

  return (
    <>
      <TripList
        cards={cards}
        status={status}
        filtered={search.trim() !== "" || lifecycle !== null}
        highlightedId={previewTripId}
        viewingTripId={viewingTripId}
        onHighlight={(card) => setPreviewTripId(card.tripId)}
        onLoadMore={loadMore}
        renderCardMenu={renderCardMenu}
        renderDetail={panel}
      />
      {candidate && !found ? panel(candidate) : null}
    </>
  );
}

type CandidateActionsProps = Pick<TripPaneActions, "onRequestSwitch"> & {
  card: TripCard;
  isViewed: boolean;
  onClose: () => void;
};

function CandidateActions({ card, isViewed, onClose, onRequestSwitch }: CandidateActionsProps) {
  const { openPrivately } = useTripContext();
  const archived = card.lifecycle === "archived";
  const canSwitch = onRequestSwitch !== undefined;
  const hint = archived ? "Restore first" : card.isCurrent ? "Followers already see this trip" : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isViewed ? null : (
        <Button
          type="button"
          onClick={() => {
            openPrivately({ tripId: card.tripId, title: card.title });
            onClose();
          }}
        >
          Open privately
        </Button>
      )}
      {canSwitch ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={archived || card.isCurrent}
            aria-describedby={hint ? `trip-switch-hint-${card.tripId}` : undefined}
            onClick={() => onRequestSwitch(card)}
          >
            Set as shared current
          </Button>
          {hint ? (
            <span id={`trip-switch-hint-${card.tripId}`} className="text-xs text-[var(--ink-3)]">
              {hint}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
