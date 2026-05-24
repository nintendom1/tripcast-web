import * as React from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickOnMapButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

/**
 * Drop-in "Pick on map" trigger for forms that capture a coordinate.
 *
 * The actual coordinate-pick state lives in TripMap (see AGENTS.md "Coordinate-Pick UX Pattern").
 * Consumers wire `onClick` to a callback from TripMap (typically via a prop or context),
 * and TripMap manages the panel-hide behavior on the form.
 */
export const PickOnMapButton = React.forwardRef<HTMLButtonElement, PickOnMapButtonProps>(
  ({ label = "Pick on map", className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--bg-paper)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-1)]",
        "transition-colors hover:bg-[var(--bg-paper-2)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--flag)]",
        className,
      )}
      {...props}
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  ),
);
PickOnMapButton.displayName = "PickOnMapButton";

export interface LocationPickerFieldProps {
  /** Picked latitude, if any. */
  lat?: number;
  /** Picked longitude, if any. */
  lon?: number;
  /** Enter map-pick mode (wires to TripMap's coordinate-pick request). */
  onPick: () => void;
  /** Clear the currently-picked coordinate. */
  onClear: () => void;
  /** Section label shown above the control. Defaults to "Location". */
  label?: string;
  className?: string;
}

/**
 * Prominent "Location" form field for capturing a map coordinate.
 *
 * Empty state: a full-width bordered button ("Pick location on map →").
 * Set state: a chip-card showing the pin + coordinates with Change / Clear actions.
 *
 * Coordinate-pick state lives in TripMap (see AGENTS.md "Coordinate-Pick UX Pattern");
 * `onPick` should trigger the form's `onRequestCoordinatePick` callback.
 */
export function LocationPickerField({
  lat,
  lon,
  onPick,
  onClear,
  label = "Location",
  className,
}: LocationPickerFieldProps) {
  const hasCoord = lat !== undefined && lon !== undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {label}
      </span>
      {hasCoord ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5 shadow-[var(--shadow-card)]">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--flag)]" aria-hidden="true" />
            <span className="truncate font-[var(--font-mono)]">
              {lat!.toFixed(5)}, {lon!.toFixed(5)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onPick}
              className="rounded-full px-2 py-1 text-xs font-semibold text-[var(--ink-2)] underline transition-colors hover:bg-[var(--meter-track)]"
            >
              Change
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-2 py-1 text-xs font-semibold text-[var(--ink-danger)] underline transition-colors hover:bg-[var(--meter-track)]"
            >
              Clear
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--line-soft)] bg-[var(--bg-paper)] px-4 py-3 text-sm font-semibold text-[var(--ink-1)]",
            "transition-colors hover:bg-[var(--bg-card)]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--flag)]",
          )}
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--flag)]" aria-hidden="true" />
            Pick location on map
          </span>
          <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export interface MapPickerBannerProps {
  label: string;
  onCancel: () => void;
  className?: string;
}

/**
 * Banner displayed at the top of the map while a coordinate pick is in progress.
 *
 * Mirrors the design handoff's pick banner styling — Cancel reverts the pick mode
 * and re-shows the originating form.
 */
export function MapPickerBanner({ label, onCancel, className }: MapPickerBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-center justify-between gap-3 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
        <MapPin className="h-4 w-4 text-[var(--flag)]" aria-hidden="true" />
        Tap the map to set {label}.
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)]"
      >
        Cancel
      </button>
    </div>
  );
}
