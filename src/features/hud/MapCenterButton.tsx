import * as React from "react";
import { LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MapCenterButtonProps {
  onClick: () => void;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Bottom-right map utility — recenters on the traveler's last known position.
 *
 * Replaces the standalone LocateFixed FAB button from the old map-utility
 * cluster. Lives alongside the Dock rather than in a vertical FAB column.
 */
export function MapCenterButton({
  onClick,
  active = false,
  className,
  ariaLabel = "Center map on traveler",
}: MapCenterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-card)] text-[var(--ink-1)] shadow-[var(--shadow-card)] transition-transform active:scale-[0.96]",
        active ? "text-[var(--flag)]" : "",
        className,
      )}
    >
      <LocateFixed className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
