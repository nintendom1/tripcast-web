import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Compass, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSamplerMode, setSamplerMode, type SamplerMode } from "../../lib/samplerMode";

export interface LivePillProps {
  on: boolean;
  onToggle: () => void;
  trailEnabled?: boolean;
  className?: string;
}

const OPTIONS: Array<{ value: SamplerMode; label: string }> = [
  { value: "precise", label: "Precise" },
  { value: "relevant", label: "Relevant" },
  { value: "legacy", label: "Legacy" },
];

/**
 * Slim LIVE / PAUSED pill, Traveler only. Replaces the bottom-right Share-Location
 * button — collocating the toggle with the HUD reduces map-chrome density and makes
 * the broadcasting state easy to read at a glance.
 *
 * Supports a hold-and-reveal gesture: long-press (250ms) to display a vertical menu fanning
 * out above the pill to quickly change the GPS precision. Glide finger to select, or release
 * and tap.
 */
export function LivePill({ on, onToggle, trailEnabled = false, className }: LivePillProps) {
  const samplerMode = useSamplerMode();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<SamplerMode | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Handle outside clicks to close the menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        setHoveredMode(null);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [isMenuOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Only handle primary button
    if (e.button !== 0) return;

    isPointerDownRef.current = true;
    hasMovedRef.current = false;
    isLongPressActiveRef.current = false;
    touchStartRef.current = { x: e.clientX, y: e.clientY };

    // Capture the pointer to receive events even if the finger moves off-button
    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setIsMenuOpen(true);
      setHoveredMode(null);

      try {
        if (typeof window !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
      } catch (err) {
        // Ignore haptic errors
      }
    }, 250);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPointerDownRef.current) return;

    const start = touchStartRef.current;
    if (start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 8) {
        hasMovedRef.current = true;
        // If they drag significantly before long press active, cancel the timer
        if (!isLongPressActiveRef.current && longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
      }
    }

    if (isLongPressActiveRef.current) {
      // Find what element is currently under the pointer
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const optionEl = element?.closest("[data-mode]");
      if (optionEl) {
        const mode = optionEl.getAttribute("data-mode") as SamplerMode;
        setHoveredMode(mode);
      } else {
        setHoveredMode(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    if (typeof e.currentTarget.releasePointerCapture === "function") {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    if (isLongPressActiveRef.current) {
      if (hoveredMode) {
        setSamplerMode(hoveredMode);
        setIsMenuOpen(false);
        setHoveredMode(null);
        try {
          if (typeof window !== "undefined" && navigator.vibrate) {
            navigator.vibrate(10);
          }
        } catch (err) {}
      } else {
        // Released outside any option
        // If they dragged significantly, close the menu (standard release-outside dismiss)
        // If they did not drag, keep the menu open so they can tap
        if (hasMovedRef.current) {
          setIsMenuOpen(false);
        }
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    isPointerDownRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    if (typeof e.currentTarget.releasePointerCapture === "function") {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
    setIsMenuOpen(false);
    setHoveredMode(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // If long press was active, ignore the trailing click event
    if (isLongPressActiveRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (isMenuOpen) {
      setIsMenuOpen(false);
      setHoveredMode(null);
    } else {
      onToggle();
    }
  };

  return (
    <div className="relative inline-flex" ref={containerRef}>
      {isMenuOpen && (
        <div
          role="menu"
          aria-label="GPS Precision options"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-1 w-36 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-card)] z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-auto touch-none"
        >
          {OPTIONS.map((option) => {
            const isSelected = option.value === samplerMode;
            const isHovered = option.value === hoveredMode;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                data-mode={option.value}
                onClick={() => {
                  setSamplerMode(option.value);
                  setIsMenuOpen(false);
                  setHoveredMode(null);
                }}
                className={cn(
                  "w-full min-h-11 px-3 py-2 text-xs font-bold rounded-lg transition-all text-center select-none pointer-events-auto",
                  isSelected
                    ? "bg-[var(--flag)] text-white shadow-sm"
                    : isHovered
                      ? "bg-[var(--line-soft)] text-[var(--ink-1)]"
                      : "text-[var(--ink-2)] hover:bg-[var(--line-soft)]/50",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        aria-pressed={on}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
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
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] shadow-[var(--shadow-card)] transition-colors select-none touch-none",
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
    </div>
  );
}
