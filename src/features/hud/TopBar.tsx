import * as React from "react";
import { Moon, Settings, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

import type { Role } from "@/convex/tripcastApi";
import { TERMS } from "../../copy/terminology";
import { useTheme } from "../../providers/ThemeProvider";

export interface TopBarProps {
  role: Role;
  onOpenOptions: () => void;
  className?: string;
}

/**
 * Map-first top bar: brand wordmark left, role badge + Options icon right.
 *
 * Replaces the previous full-width header with a low-profile chrome strip that
 * sits above the map without dominating it. The role badge is informational
 * only — mode is determined by the session that signed in.
 */
export function TopBar({ role, onOpenOptions, className }: TopBarProps) {
  const isTraveler = role === "traveler";
  const roleLabel = isTraveler ? TERMS.traveler : TERMS.follower;
  const { resolvedTheme, setMode } = useTheme();
  const nextTheme = resolvedTheme === "meadow" ? "constellation" : "meadow";
  const NextThemeIcon = nextTheme === "meadow" ? Sun : Moon;

  return (
    <header
      className={cn(
        // pt inset lets the paper bg fill the iOS status-bar/notch area while
        // the brand row sits below it. Collapses to 0 on web/desktop.
        "relative z-[2] bg-[var(--bg-paper)] pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="tripcast-frame flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2 font-[var(--font-display)] text-base font-extrabold tracking-tight text-[var(--ink-1)]">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md text-white"
          style={{ background: "var(--flag)" }}
          aria-hidden="true"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 22V4 M4 4l9 4-3 4 7 3-9 3" />
          </svg>
        </span>
        TripCast
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode(nextTheme)}
          aria-label={`Switch to ${nextTheme === "meadow" ? "light" : "dark"} theme`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper-2)]"
        >
          <NextThemeIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.12em]",
            isTraveler
              ? "bg-[var(--flag)] text-white"
              : "bg-[var(--teal)] text-white",
          )}
          aria-label={`Signed in as ${roleLabel}`}
        >
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-white/90" />
          {roleLabel}
        </span>
        <button
          type="button"
          onClick={onOpenOptions}
          aria-label="Options"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-1)] transition-colors hover:bg-[var(--bg-paper-2)]"
        >
          <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
      </div>
    </header>
  );
}
