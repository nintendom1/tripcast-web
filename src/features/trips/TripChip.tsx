import { lazy, Suspense, useRef, useState, type LazyExoticComponent } from "react";
import { ChevronDown } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import { cn } from "@/lib/utils";
import { useTripContext } from "../../providers/TripContextProvider";
import type { TripPaneActions } from "./TripSwitcherSheet";

// The pane (list subscription, previews) loads on first open, so the header carries none of it.
// `React.lazy` caches a rejected import, so each retry after a failed chunk load builds a fresh lazy component.
const sheetAttempts: Array<LazyExoticComponent<typeof import("./TripSwitcherSheet").TripSwitcherSheet>> = [];
function sheetForAttempt(attempt: number) {
  sheetAttempts[attempt] ??= lazy(() =>
    import("./TripSwitcherSheet").then((module) => ({ default: module.TripSwitcherSheet })),
  );
  return sheetAttempts[attempt];
}

export type TripChipProps = TripPaneActions & { className?: string };

/**
 * Header chip naming the trip on the map ("Current · <title>" or "Viewing privately · <title>"). Tapping it opens
 * the trip pane, whose open state it owns. Renders only for a Traveler while multi-trip is enabled.
 */
export function TripChip({ className, ...actions }: TripChipProps) {
  const { role, multiTripEnabled, viewingMode, viewingTrip, currentTrip } = useTripContext();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const chipRef = useRef<HTMLButtonElement>(null);

  if (role !== "traveler" || !multiTripEnabled) return null;

  const label = viewingMode === "private" ? "Viewing privately" : "Current";
  const title = viewingTrip?.title ?? currentTrip?.title ?? "Trip";
  const TripSwitcherSheet = sheetForAttempt(attempt);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        aria-label={`${label} · ${title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
        className={cn(
          "flex h-8 min-w-0 max-w-full flex-1 items-center justify-start gap-1 sm:flex-none rounded-full border border-[var(--line-soft)] px-2.5 text-xs font-semibold text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper-2)]",
          className,
        )}
      >
        <span className="hidden min-w-0 truncate sm:inline">{label} ·</span>
        <span className="min-w-0 truncate">{title}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
            <TripSwitcherSheet open={open} onOpenChange={setOpen} returnFocusRef={chipRef} {...actions} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </>
  );
}
