import { lazy, Suspense, useCallback, useEffect, useRef, useState, type LazyExoticComponent, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import type { TripCard } from "../../convex/tripcastApi";
import { ConfirmSharedTripSwitchDialog } from "./ConfirmSharedTripSwitchDialog";
import { TripLifecycleMenu } from "./TripLifecycleMenu";
import type { TripCardMenuInfo } from "./TripSwitcherSheet";

const NOTICE_MS = 4000;

// The create sheet lists trips (a paginated subscription), so it loads on first use and the header chip stays light.
// `React.lazy` caches a rejected import, so each retry after a failed chunk load builds a fresh lazy component.
const createAttempts: Array<LazyExoticComponent<typeof import("./CreateTripSheet").CreateTripSheet>> = [];
function createSheetForAttempt(attempt: number) {
  createAttempts[attempt] ??= lazy(() =>
    import("./CreateTripSheet").then((module) => ({ default: module.CreateTripSheet })),
  );
  return createAttempts[attempt];
}

export type UseTripPaneActionsOptions = {
  /** Closes the trip pane (the chip owns its open state). */
  closePane: () => void;
  /** Opens the app's End Trip sheet for the shared current trip. */
  onRequestEndCurrentTrip?: () => void;
};

export type TripPaneActionsResult = {
  /** The three optional pane props, plus the card the pane should highlight after a create. */
  props: {
    onRequestSwitch: (card: TripCard) => void;
    onRequestCreate: () => void;
    renderCardMenu: (card: TripCard, info?: TripCardMenuInfo) => ReactNode;
    highlightTripId: string | null;
  };
  /** The dialogs, sheets and notice this hook owns: render them once, beside the pane. */
  nodes: ReactNode;
};

/**
 * Owns the trip pane's change flows: the create sheet, the shared-switch confirmation, the per-card menu and a
 * short notice. Holds no Convex call itself (each flow mounts only while open), so a closed pane costs nothing.
 */
export function useTripPaneActions({
  closePane,
  onRequestEndCurrentTrip,
}: UseTripPaneActionsOptions): TripPaneActionsResult {
  const [switchCard, setSwitchCard] = useState<TripCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [createAttempt, setCreateAttempt] = useState(0);
  const [highlightTripId, setHighlightTripId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  // The control that opened a flow, so focus goes back to it when the flow closes.
  const openerRef = useRef<HTMLElement | null>(null);
  const noticeId = useRef(0);
  // The switch dialog currently open. A late answer from a switch the Traveler walked away from must not close or
  // change a dialog that belongs to another trip, so every close compares against this.
  const switchRef = useRef<TripCard | null>(null);
  const openSwitch = (card: TripCard | null) => {
    switchRef.current = card;
    setSwitchCard(card);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((message: string) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, message });
  }, []);

  const rememberOpener = () => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const props: TripPaneActionsResult["props"] = {
    onRequestSwitch: (card) => {
      rememberOpener();
      openSwitch(card);
    },
    onRequestCreate: () => {
      rememberOpener();
      setCreating(true);
    },
    renderCardMenu: (card, info) => (
      <TripLifecycleMenu
        key={card.tripId}
        card={card}
        onlyTrip={info?.onlyTrip}
        notify={notify}
        closePane={closePane}
        onRequestEndCurrentTrip={onRequestEndCurrentTrip}
      />
    ),
    highlightTripId,
  };

  const CreateSheet = createSheetForAttempt(createAttempt);

  const nodes = (
    <>
      {creating ? (
        <ErrorBoundary
          onReset={() => setCreateAttempt((n) => n + 1)}
          fallbackRender={({ resetErrorBoundary }) => (
            <div
              role="alert"
              className="fixed inset-x-4 bottom-24 z-[120] mx-auto flex w-fit max-w-sm items-center gap-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--ink-1)] shadow-xl"
            >
              <span>Create trip could not load.</span>
              <button type="button" className="font-semibold underline" onClick={resetErrorBoundary}>
                Retry
              </button>
              <button type="button" className="font-semibold text-[var(--ink-3)]" onClick={() => setCreating(false)}>
                Close
              </button>
            </div>
          )}
        >
          <Suspense fallback={null}>
            <CreateSheet
              returnFocusRef={openerRef}
              onClose={() => setCreating(false)}
              onCreated={(tripId) => {
                setHighlightTripId(tripId);
                setCreating(false);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      {switchCard ? (
        <ConfirmSharedTripSwitchDialog
          // A new card is a new dialog: a fresh snapshot.
          key={switchCard.tripId}
          card={switchCard}
          returnFocusRef={openerRef}
          onClose={() => openSwitch(null)}
          onNotice={notify}
          onSwitched={({ liveWasOn }) => {
            const { tripId, title } = switchCard;
            // Close only the dialog (and pane) this answer belongs to: another trip's dialog opened meanwhile stays.
            if (switchRef.current?.tripId === tripId) {
              openSwitch(null);
              closePane();
            }
            // When live sharing was on, the live-sharing notice announces the switch: exactly one notice.
            if (!liveWasOn) notify(`Followers now see ${title}.`);
          }}
        />
      ) : null}
      {notice ? (
        <div
          key={notice.id}
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-24 z-[120] mx-auto w-fit max-w-sm rounded-full bg-[var(--ink-1)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-on-dark)] shadow-xl"
        >
          {notice.message}
        </div>
      ) : null}
    </>
  );

  return { props, nodes };
}
