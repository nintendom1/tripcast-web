import * as React from "react";
import { Compass, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LivePillProps {
  on: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Slim LIVE / PAUSED pill, Traveler only. Replaces the bottom-right Share-Location
 * button — collocating the toggle with the HUD reduces map-chrome density and makes
 * the broadcasting state easy to read at a glance.
 */
export function LivePill({ on, onToggle, className }: LivePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Stop sharing live location" : "Start sharing live location"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] shadow-[var(--shadow-card)] transition-colors",
        on
          ? "bg-[var(--flag)] text-white"
          : "bg-[var(--bg-card)] text-[var(--ink-2)]",
        className,
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center">
        {on ? (
          <Compass className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Pause className="h-3 w-3" aria-hidden="true" />
        )}
      </span>
      {on ? "LIVE" : "PAUSED"}
      {on ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full bg-white"
        />
      ) : null}
    </button>
  );
}
