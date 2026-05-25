import * as React from "react";
import { Compass, Route } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LivePillProps {
  on: boolean;
  onToggle: () => void;
  trailEnabled?: boolean;
  className?: string;
}

/**
 * Slim LIVE / PAUSED pill, Traveler only. Replaces the bottom-right Share-Location
 * button — collocating the toggle with the HUD reduces map-chrome density and makes
 * the broadcasting state easy to read at a glance.
 */
export function LivePill({ on, onToggle, trailEnabled = false, className }: LivePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={
        trailEnabled
          ? on
            ? "Stop sharing live location. Live Trail is enabled."
            : "Start sharing live location. Live Trail is enabled."
          : on
            ? "Stop sharing live location"
            : "Start sharing live location"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] shadow-[var(--shadow-card)] transition-colors",
        on
          ? "bg-[var(--flag)] text-white"
          : "bg-[var(--bg-card)] text-[var(--ink-2)]",
        className,
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        <Compass className="h-3 w-3" aria-hidden="true" />
      </span>
      {on ? "LIVE" : "PAUSED"}
      {trailEnabled ? (
        <Route className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {on ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-white"
        />
      ) : null}
    </button>
  );
}
