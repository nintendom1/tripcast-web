import { lazy, Suspense, useEffect, useRef, useState, type LazyExoticComponent, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { cn } from "@/lib/utils";
import { useTripContext } from "../../providers/TripContextProvider";
import { announcePaneOpened, subscribePaneOpened } from "./paneExclusion";
import type { TripPaneActions } from "./TripSwitcherSheet";
import { useSwitchPending } from "./tripSwitchState";
import { useTripPaneActions } from "./useTripPaneActions";

// The pane (list subscription, previews) loads on first open, so the header carries none of it.
// `React.lazy` caches a rejected import, so each retry after a failed chunk load builds a fresh lazy component.
const sheetAttempts: Array<LazyExoticComponent<typeof import("./TripSwitcherSheet").TripSwitcherSheet>> = [];
function sheetForAttempt(attempt: number) {
  sheetAttempts[attempt] ??= lazy(() =>
    import("./TripSwitcherSheet").then((module) => ({ default: module.TripSwitcherSheet })),
  );
  return sheetAttempts[attempt];
}

export type TripsPaneToggleProps = TripPaneActions & {
  /** The top bar's logo: its class string and its contents (flag square and wordmark). */
  logoClassName: string;
  logo: ReactNode;
  /** Opens the app's End Trip sheet for the shared current trip (the card menu's Complete trip). */
  onRequestEndCurrentTrip?: () => void;
};

/**
 * The top bar's logo. For a Traveler with multi-trip on it is the show/hide button of the Trips pane, whose open
 * state it owns; a dot on the flag marks a private view. Otherwise it renders the same inert `<div>` as the top bar.
 */
export function TripsPaneToggle({ logoClassName, logo, onRequestEndCurrentTrip, ...actions }: TripsPaneToggleProps) {
  const { role, multiTripEnabled, viewingMode } = useTripContext();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // While a switch awaits the server the logo says "switching…" but still opens the pane: a switch that never
  // answers (offline) must not lock the Traveler out. Only starting ANOTHER switch is disabled.
  const switching = useSwitchPending();
  const pane = useTripPaneActions({ closePane: () => setOpen(false), onRequestEndCurrentTrip });
  const enabled = role === "traveler" && multiTripEnabled;

  // A Dock pane opening closes this one (one bottom pane at a time).
  useEffect(() => {
    if (!enabled) return;
    return subscribePaneOpened((owner) => {
      if (owner === "map") setOpen(false);
    });
  }, [enabled]);

  if (!enabled) return <div className={logoClassName}>{logo}</div>;

  const privateView = viewingMode === "private";
  const label = ["TripCast: Trips", privateView ? "viewing privately" : null, switching ? "switching…" : null]
    .filter(Boolean)
    .join(", ");
  const TripSwitcherSheet = sheetForAttempt(attempt);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={switching || undefined}
        onClick={() => {
          // The pane ignores a press on this button as an outside press, so this click alone decides.
          if (open) {
            setOpen(false);
            return;
          }
          announcePaneOpened("trips");
          setEverOpened(true);
          setOpen(true);
        }}
        // Concatenated, not `cn`: twMerge would drop the logo's `font-[var(--font-display)]` as a font weight.
        // 44px to tap, 36px in the row (-my-1), the logo where it was (-ml-2 against px-2).
        className={`${logoClassName} relative -my-1 -ml-2 h-11 rounded-lg px-2`}
      >
        {logo}
        {privateView || switching ? (
          <span
            aria-hidden="true"
            data-testid="trips-pane-dot"
            className={cn(
              "absolute left-7 top-1.5 h-2 w-2 rounded-full bg-[var(--teal)] ring-2 ring-[var(--bg-paper)]",
              switching && "animate-pulse",
            )}
          />
        ) : null}
      </button>
      {everOpened ? (
        <ErrorBoundary
          onReset={() => setAttempt((n) => n + 1)}
          fallbackRender={({ resetErrorBoundary }) => (
            <div role="alert">
              <button
                type="button"
                onClick={resetErrorBoundary}
                className="h-8 rounded-full border border-[var(--line-soft)] px-2.5 text-xs font-semibold text-[var(--ink-1)]"
              >
                Trips could not load. Retry
              </button>
            </div>
          )}
        >
          <Suspense
            fallback={
              <span role="status" aria-busy="true" className="sr-only">
                Loading trips…
              </span>
            }
          >
            <TripSwitcherSheet
              open={open}
              onOpenChange={setOpen}
              returnFocusRef={toggleRef}
              onRequestSwitch={actions.onRequestSwitch ?? pane.props.onRequestSwitch}
              onRequestCreate={actions.onRequestCreate ?? pane.props.onRequestCreate}
              renderCardMenu={actions.renderCardMenu ?? pane.props.renderCardMenu}
              highlightTripId={pane.props.highlightTripId}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      {pane.nodes}
    </>
  );
}
