import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
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
  { value: "legacy", label: "Legacy" },
  { value: "relevant", label: "Relevant" },
  { value: "precise", label: "Precise" },
];

const LONG_PRESS_MS = 200;
const MOVE_CANCEL_THRESHOLD_PX = 8;
const CLICK_SUPPRESSION_MS = 500;

type GesturePhase = "idle" | "pending" | "active" | "cancelled";

function vibrate(duration: number): void {
  try {
    navigator.vibrate?.(duration);
  } catch {
    // Haptics are optional.
  }
}

/**
 * Slim LIVE / PAUSED pill, Traveler only. Replaces the bottom-right Share-Location
 * button — collocating the toggle with the HUD reduces map-chrome density and makes
 * the broadcasting state easy to read at a glance.
 *
 * Supports a hold-and-reveal gesture: long-press (200ms) to display a vertical menu fanning
 * out below the pill to quickly change the GPS precision. Glide finger to select, or release
 * and tap.
 */
export function LivePill({ on, onToggle, trailEnabled = false, className }: LivePillProps) {
  const samplerMode = useSamplerMode();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<SamplerMode | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesturePhaseRef = useRef<GesturePhase>("idle");
  const activePointerIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearClickSuppression = () => {
    suppressNextClickRef.current = false;
    if (clickSuppressionTimerRef.current !== null) {
      clearTimeout(clickSuppressionTimerRef.current);
      clickSuppressionTimerRef.current = null;
    }
  };

  const suppressNextClick = () => {
    clearClickSuppression();
    suppressNextClickRef.current = true;
    clickSuppressionTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      clickSuppressionTimerRef.current = null;
    }, CLICK_SUPPRESSION_MS);
  };

  const resetPointerGesture = () => {
    clearLongPressTimer();
    gesturePhaseRef.current = "idle";
    activePointerIdRef.current = null;
    touchStartRef.current = null;
    hasMovedRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
      if (clickSuppressionTimerRef.current !== null) {
        clearTimeout(clickSuppressionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutside = (e: globalThis.PointerEvent) => {
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

  const releasePointer = (e: PointerEvent<HTMLButtonElement>) => {
    if (typeof e.currentTarget.releasePointerCapture !== "function") return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The browser may already have released the pointer.
    }
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || activePointerIdRef.current !== null) return;

    clearClickSuppression();
    activePointerIdRef.current = e.pointerId;
    gesturePhaseRef.current = "pending";
    hasMovedRef.current = false;
    touchStartRef.current = { x: e.clientX, y: e.clientY };

    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is an enhancement; document hit-testing still works without it.
      }
    }

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (
        gesturePhaseRef.current !== "pending" ||
        activePointerIdRef.current !== e.pointerId
      ) {
        return;
      }
      gesturePhaseRef.current = "active";
      setIsMenuOpen(true);
      setHoveredMode(null);
      vibrate(15);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const start = touchStartRef.current;
    if (start) {
      const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (distance > MOVE_CANCEL_THRESHOLD_PX) {
        hasMovedRef.current = true;
        if (gesturePhaseRef.current === "pending") {
          gesturePhaseRef.current = "cancelled";
          clearLongPressTimer();
        }
      }
    }

    if (gesturePhaseRef.current === "active") {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const optionEl = element?.closest<HTMLElement>("[data-mode]");
      const mode = optionEl?.getAttribute("data-mode");
      const validMode = OPTIONS.find((option) => option.value === mode)?.value ?? null;
      const isOwnOption = Boolean(
        optionEl && containerRef.current?.contains(optionEl) && validMode,
      );
      setHoveredMode(isOwnOption ? validMode : null);
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const phase = gesturePhaseRef.current;
    const moved = hasMovedRef.current;
    clearLongPressTimer();
    releasePointer(e);

    if (phase === "cancelled") {
      suppressNextClick();
    } else if (phase === "active") {
      suppressNextClick();
      if (hoveredMode) {
        setSamplerMode(hoveredMode);
        setIsMenuOpen(false);
        setHoveredMode(null);
        vibrate(10);
      } else if (moved) {
        setIsMenuOpen(false);
        setHoveredMode(null);
      }
    }

    resetPointerGesture();
  };

  const handlePointerCancel = (e: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    releasePointer(e);
    resetPointerGesture();
    setIsMenuOpen(false);
    setHoveredMode(null);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (suppressNextClickRef.current) {
      clearClickSuppression();
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
          style={{ top: "calc(100% + 0.5rem)" }}
          className="pointer-events-auto absolute left-0 z-50 flex w-36 touch-none flex-col gap-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-card)] animate-in fade-in slide-in-from-top-2 duration-150"
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
                  "pointer-events-auto min-h-11 w-full select-none rounded-lg px-3 py-2 text-center text-xs font-bold transition-all",
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
          "inline-flex touch-none select-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] shadow-[var(--shadow-card)] transition-colors",
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
