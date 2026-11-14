import { useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLiveSharingEnabled } from "@/lib/liveSharingPreference";
import { Sheet, SheetBody, SheetCloseButton, SheetContent, SheetGradientHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import type { TripCard, TripLifecycle } from "../../convex/tripcastApi";
import { useTripContext } from "../../providers/TripContextProvider";
import { useTripsPersonality } from "../redesign/sheetPersonality";
import { STILL_WAITING_MESSAGE, useSwitchPending, useSwitchStalled } from "./tripSwitchState";
import { TripList } from "./TripList";
import { inertCardLabel, LIFECYCLE_LABELS } from "./TripListRow";
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
  renderCardMenu?: (card: TripCard, info?: TripCardMenuInfo) => ReactNode;
};

/** What the catalog knows about a card that its menu needs. */
export type TripCardMenuInfo = {
  /** The unfiltered catalog is fully loaded and holds only this trip. */
  onlyTrip: boolean;
};

export type TripSwitcherSheetProps = TripPaneActions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The logo that toggles the pane: it receives focus when the pane closes, and a press on it is left to its own
   * click (it is not an outside press).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Highlights this card (a trip just created); the pane keeps its own highlight otherwise. */
  highlightTripId?: string | null;
};

const LIFECYCLES: TripLifecycle[] = ["planned", "in_progress", "completed", "archived"];

type ChangeDetails = Parameters<NonNullable<ComponentProps<typeof Sheet>["onOpenChange"]>>[1];

function eventWithin(event: Event, matches: (element: Element) => boolean): boolean {
  const related = event instanceof FocusEvent ? event.relatedTarget : null;
  return [event.target, related].some((node) => node instanceof Element && matches(node));
}

/**
 * A close the pane refuses: a press on (or focus moving to) the logo, whose click toggles the pane itself, and an
 * Escape from inside something marked `data-sheet-nested-dialog` beside the pane (Create trip sits beside it, not
 * inside it). Base UI popups already keep their own Escape; this covers the rest, such as Create's load-failure alert.
 */
function keepsPaneOpen(details: ChangeDetails, toggle: HTMLElement | null): boolean {
  if (details.reason === "outside-press" || details.reason === "focus-out") {
    return toggle !== null && eventWithin(details.event, (element) => toggle.contains(element));
  }
  if (details.reason === "escape-key") {
    return eventWithin(details.event, (element) => element.closest("[data-sheet-nested-dialog]") !== null);
  }
  return false;
}

/**
 * Bottom pane, like the Awards pane: not modal, so the map stays usable and touching it closes the pane. Browses,
 * filters and previews the Traveler's trips and opens one privately. On open the pane itself takes focus (no
 * control, no keyboard). The list subscription and preview cache live in `TripCatalog`, which exists only while the pane is open.
 */
export function TripSwitcherSheet({
  open,
  onOpenChange,
  returnFocusRef,
  onRequestSwitch,
  onRequestCreate,
  renderCardMenu,
  highlightTripId,
}: TripSwitcherSheetProps) {
  const personality = useTripsPersonality();
  // Focus lands on the pane itself: inside it for a keyboard or screen-reader user, on no control (no focus ring on
  // Create trip, no keyboard). Without this Base UI focuses the first tabbable, as no Dialog.Trigger opened it.
  const paneRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(next, details) => {
        if (!next && keepsPaneOpen(details, returnFocusRef?.current ?? null)) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      {/* No pb-* or pt-* here: `cn` would drop `mapAdjacent`'s Dock clearance. The body carries the safe area. */}
      <SheetContent
        ref={paneRef}
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        initialFocus={paneRef}
        finalFocus={returnFocusRef}
        className="z-[10] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <SheetGradientHeader color={personality.color} bg={personality.bg}>
          <SheetTitle>Trips</SheetTitle>
          <div className="flex items-center gap-2">
            {onRequestCreate ? (
              <Button type="button" size="sm" className="rounded-full" onClick={onRequestCreate}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Create trip
              </Button>
            ) : null}
            <SheetCloseButton />
          </div>
        </SheetGradientHeader>
        <TripPaneBody
          onClose={() => onOpenChange(false)}
          onRequestSwitch={onRequestSwitch}
          renderCardMenu={renderCardMenu}
          highlightTripId={highlightTripId}
        />
      </SheetContent>
    </Sheet>
  );
}

type TripPaneBodyProps = Pick<TripPaneActions, "onRequestSwitch" | "renderCardMenu"> & {
  highlightTripId?: string | null;
  onClose: () => void;
};

function TripPaneBody({ onClose, onRequestSwitch, renderCardMenu, highlightTripId }: TripPaneBodyProps) {
  const { followerTrip, viewingTrip, viewingMode, returnToCurrent, serverTripStatus = "known" } = useTripContext();
  const liveSharing = useLiveSharingEnabled();
  const switching = useSwitchPending();
  const stalled = useSwitchStalled();
  const [lifecycle, setLifecycle] = useState<TripLifecycle | null>(null);

  return (
    <SheetBody
      data-trip-pane-scroll=""
      className="flex flex-col gap-3"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {stalled ? (
        <p role="status" className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-2)]">
          {STILL_WAITING_MESSAGE}
        </p>
      ) : null}
      {serverTripStatus !== "known" ? (
        <p role="status" className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-3)]">
          {serverTripStatus === "loading" ? "Loading what Followers see…" : "What Followers see is unavailable right now."}
        </p>
      ) : followerTrip ? (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm">
          <span className="text-[var(--ink-3)]">Followers currently see: </span>
          <span className="font-semibold text-[var(--ink-1)]">{followerTrip.title}</span>
          {liveSharing ? (
            <span className="ml-2 rounded-full bg-[var(--meter-track)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
              Live
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="min-w-0 truncate text-[var(--ink-2)]">
          You are viewing: <span className="font-semibold text-[var(--ink-1)]">{viewingTrip?.title ?? "—"}</span>
          {switching ? (
            <span role="status" className="ml-2 text-xs text-[var(--ink-3)]">
              Switching…
            </span>
          ) : null}
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
          lifecycle={lifecycle}
          onClose={onClose}
          onRequestSwitch={onRequestSwitch}
          renderCardMenu={renderCardMenu}
          highlightTripId={highlightTripId}
        />
      </FeatureBoundary>
    </SheetBody>
  );
}

type TripCatalogProps = Pick<TripPaneActions, "onRequestSwitch" | "renderCardMenu"> & {
  highlightTripId?: string | null;
  lifecycle: TripLifecycle | null;
  onClose: () => void;
};

/** Owns the ONE list subscription, the highlighted card and the one-shot preview. Mounted only while open. */
function TripCatalog({
  lifecycle,
  onClose,
  onRequestSwitch,
  renderCardMenu,
  highlightTripId = null,
}: TripCatalogProps) {
  const { viewingTripId } = useTripContext();
  const { cards, status, loadMore } = useTravelerTrips(lifecycle);
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  // A trip created while the pane is open becomes the highlighted card (it is not opened or shared).
  const [seenHighlight, setSeenHighlight] = useState(highlightTripId);
  if (highlightTripId !== seenHighlight) {
    setSeenHighlight(highlightTripId);
    if (highlightTripId) setPreviewTripId(highlightTripId);
  }
  const unfiltered = lifecycle === null;
  const onlyTrip = unfiltered && status === "exhausted" && cards.length === 1;

  const found = cards.find((card) => card.tripId === previewTripId) ?? null;
  // While a filter change reloads the first page `cards` is briefly empty: keep the last card seen so the
  // panel does not flash away.
  const [lastFound, setLastFound] = useState<TripCard | null>(null);
  if (found && found !== lastFound) setLastFound(found);
  const candidate = found ?? (status === "loading-first" && lastFound?.tripId === previewTripId ? lastFound : null);
  const previewable = candidate !== null && inertCardLabel(candidate) === null;
  const preview = useTripPreview(
    candidate && previewable ? { tripId: candidate.tripId, previewVersion: candidate.previewVersion } : null,
  );

  const panel = (card: TripCard) => (
    <section
      aria-label={`Preview of ${card.title}`}
      className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-paper)] p-3"
    >
      <h3 className="truncate text-sm font-semibold text-[var(--ink-1)]">{card.title}</h3>
      {inertCardLabel(card) !== null ? (
        <p className="text-sm text-[var(--ink-3)]">{inertCardLabel(card)}</p>
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
        filtered={lifecycle !== null}
        highlightedId={previewTripId}
        viewingTripId={viewingTripId}
        // A second tap on the highlighted card collapses its detail (its preview stays cached).
        onHighlight={(card) => setPreviewTripId((id) => (id === card.tripId ? null : card.tripId))}
        onLoadMore={loadMore}
        renderCardMenu={renderCardMenu ? (card) => renderCardMenu(card, { onlyTrip }) : undefined}
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
  const { openPrivately, serverTripStatus = "known" } = useTripContext();
  const archived = card.lifecycle === "archived";
  const sharedKnown = serverTripStatus === "known";
  const canSwitch = onRequestSwitch !== undefined;
  const hint = archived
    ? "Restore first"
    : card.isCurrent
      ? "Followers already see this trip"
      : sharedKnown
        ? null
        : "Available once the current trip has loaded";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isViewed ? null : (
        <Button
          type="button"
          onClick={() => {
            openPrivately({ tripId: card.tripId, title: card.title, isLegacy: card.isLegacy });
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
            disabled={archived || card.isCurrent || !sharedKnown}
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
