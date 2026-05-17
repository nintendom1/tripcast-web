import * as React from "react";
import { MapPin } from "lucide-react";
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
