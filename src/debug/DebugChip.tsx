import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Bug } from "lucide-react";
import { motion, useAnimationControls, type PanInfo, type Transition } from "framer-motion";
import { isEnabled, getLogs, subscribe } from "./debugLogger";
import {
  getActiveUiContext,
  getFloatingDebugSettings,
  subscribeActiveUiContext,
  type ActiveUiContext,
  type FloatingDebugSettings,
} from "./activeUiContext";

const EDGE_PADDING = 12;
const INITIAL_TOP = 64;
const DRAG_THRESHOLD = 5;

type SnappedEdge = "left" | "right" | "top" | "bottom";
type ChipPosition = { left: number; top: number };
type PointerStart = { id: number; x: number; y: number };

export function DebugChip({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [logCount, setLogCount] = useState(() => getLogs().length);
  const [activeContext, setActiveContext] = useState<ActiveUiContext | null>(getActiveUiContext);
  const [settings, setSettings] = useState<FloatingDebugSettings>(getFloatingDebugSettings);
  const [blink, setBlink] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useAnimationControls();
  const chipRef = useRef<HTMLButtonElement>(null);
  const snappedEdgeRef = useRef<SnappedEdge>("right");
  const positionRef = useRef<ChipPosition | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const pointerDraggedRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suppressNextClick = useCallback(() => {
    suppressNextClickRef.current = true;
    if (suppressClickTimerRef.current !== null) {
      clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 250);
  }, []);

  const getClampedPosition = useCallback((left: number, top: number, width: number, height: number) => {
    const maxLeft = Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING);
    const maxTop = Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING);

    return {
      left: Math.max(EDGE_PADDING, Math.min(maxLeft, left)),
      top: Math.max(EDGE_PADDING, Math.min(maxTop, top)),
    };
  }, []);

  const moveToPosition = useCallback((
    nextPosition: ChipPosition,
    options: { transition?: Transition } = {},
  ) => {
    const chip = chipRef.current;
    if (!chip) return;

    const rect = chip.getBoundingClientRect();
    const clamped = getClampedPosition(nextPosition.left, nextPosition.top, rect.width, rect.height);
    positionRef.current = clamped;

    const baseLeft = window.innerWidth - rect.width - EDGE_PADDING;

    controls.start({
      x: clamped.left - baseLeft,
      y: clamped.top - INITIAL_TOP,
      transition: options.transition ?? { duration: 0 },
    });
  }, [controls, getClampedPosition]);

  const moveToPinnedPosition = useCallback((
    options: { transition?: Transition } = {},
  ) => {
    const chip = chipRef.current;
    if (!chip) return;

    const rect = chip.getBoundingClientRect();
    const currentPosition = positionRef.current ?? {
      left: rect.left,
      top: rect.top,
    };
    const edge = snappedEdgeRef.current;
    let nextPosition: ChipPosition = currentPosition;

    if (edge === "left") {
      nextPosition = { left: EDGE_PADDING, top: currentPosition.top };
    } else if (edge === "right") {
      nextPosition = {
        left: window.innerWidth - rect.width - EDGE_PADDING,
        top: currentPosition.top,
      };
    } else if (edge === "top") {
      nextPosition = { left: currentPosition.left, top: EDGE_PADDING };
    } else if (edge === "bottom") {
      nextPosition = {
        left: currentPosition.left,
        top: window.innerHeight - rect.height - EDGE_PADDING,
      };
    }

    moveToPosition(nextPosition, options);
  }, [moveToPosition]);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      const nextCount = getLogs().length;
      setEnabledState(isEnabled());
      setLogCount((current) => {
        if (current !== nextCount) {
          setBlink(true);
          if (blinkTimerRef.current !== null) clearTimeout(blinkTimerRef.current);
          blinkTimerRef.current = setTimeout(() => setBlink(false), 500);
        }
        return nextCount;
      });
    });
    const unsubscribeContext = subscribeActiveUiContext(() => {
      setActiveContext(getActiveUiContext());
      setSettings(getFloatingDebugSettings());
    });

    return () => {
      unsubscribe();
      unsubscribeContext();
      if (blinkTimerRef.current !== null) {
        clearTimeout(blinkTimerRef.current);
      }
      if (suppressClickTimerRef.current !== null) {
        clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const chip = chipRef.current;
    if (!enabled || !chip) return;

    const syncPinnedPosition = () => moveToPinnedPosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncPinnedPosition);
    observer?.observe(chip);
    window.addEventListener("resize", syncPinnedPosition);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncPinnedPosition);
    };
  }, [enabled, moveToPinnedPosition]);

  if (!enabled) return null;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!chipRef.current) return;
    const dragDistance = Math.hypot(info.offset.x, info.offset.y);
    if (dragDistance >= DRAG_THRESHOLD) {
      suppressNextClick();
    }

    const rect = chipRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const distLeft = centerX;
    const distRight = vw - centerX;
    const distTop = centerY;
    const distBottom = vh - centerY;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    let targetX = rect.left;
    let targetY = rect.top;
    let snappedEdge: SnappedEdge = "right";

    if (minDist === distLeft) {
      targetX = EDGE_PADDING;
      snappedEdge = "left";
    } else if (minDist === distRight) {
      targetX = vw - rect.width - EDGE_PADDING;
      snappedEdge = "right";
    } else if (minDist === distTop) {
      targetY = EDGE_PADDING;
      snappedEdge = "top";
    } else if (minDist === distBottom) {
      targetY = vh - rect.height - EDGE_PADDING;
      snappedEdge = "bottom";
    }

    snappedEdgeRef.current = snappedEdge;
    moveToPosition({ left: targetX, top: targetY }, {
      transition: { type: "spring", stiffness: 300, damping: 30 },
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    pointerDraggedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance >= DRAG_THRESHOLD) {
      pointerDraggedRef.current = true;
      suppressNextClick();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointerDraggedRef.current) {
      suppressNextClick();
    }
    if (pointerStartRef.current?.id === event.pointerId) {
      pointerStartRef.current = null;
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (suppressNextClickRef.current) {
      event.preventDefault();
      suppressNextClickRef.current = false;
      if (suppressClickTimerRef.current !== null) {
        clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = null;
      }
      return;
    }
    onOpen();
  };

  const activeLabel = activeContext?.label ?? "none";
  const activeName = activeContext?.sheetName ?? "none";
  const compactContext = activeContext ? `${activeLabel} -> ${activeName}` : "none";
  const sourceLabel = activeContext?.sourceLabel ?? activeContext?.source ?? "Unknown";
  const sourceLine = settings.showSource ? `Source: ${sourceLabel}` : null;
  const ariaContext = settings.buttonMode === "log-count"
    ? ""
    : ` Active sheet: ${activeName}.${settings.showSource ? ` Source: ${sourceLabel}.` : ""}`;

  let content;
  if (settings.buttonMode === "compact-context") {
    content = (
      <div
        className={`flex max-w-[190px] cursor-grab items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-md transition-colors duration-200 active:cursor-grabbing ${
          blink
            ? "bg-amber-400 text-black"
            : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-80 hover:opacity-100"
        }`}
      >
        <Bug className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate pointer-events-none">Debug · {compactContext}</span>
      </div>
    );
  } else if (settings.buttonMode === "detailed-context") {
    content = (
      <div
        className={`grid max-w-[210px] cursor-grab gap-0.5 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold leading-tight shadow-md transition-colors duration-200 active:cursor-grabbing ${
          blink
            ? "bg-amber-400 text-black"
            : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-85 hover:opacity-100"
        }`}
      >
        <span className="flex items-center gap-1 font-bold pointer-events-none">
          <Bug className="h-3 w-3 shrink-0" aria-hidden />
          Debug ({logCount})
        </span>
        <span className="truncate pointer-events-none">Active: {activeName}</span>
        {sourceLine ? <span className="truncate pointer-events-none">{sourceLine}</span> : null}
      </div>
    );
  } else {
    content = (
      <div
        className={`flex cursor-grab items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-md transition-colors duration-200 active:cursor-grabbing ${
          blink
            ? "bg-amber-400 text-black"
            : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-75 hover:opacity-100"
        }`}
      >
        <Bug className="h-3 w-3 pointer-events-none" aria-hidden />
        <span className="pointer-events-none">{logCount}</span>
      </div>
    );
  }

  return (
    <motion.button
      ref={chipRef}
      type="button"
      drag
      dragMomentum={false}
      animate={controls}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      aria-label={`Open debug panel.${ariaContext}`}
      data-debug-chip
      className="pointer-events-auto fixed z-[100] appearance-none border-none bg-transparent p-0"
      style={{
        right: EDGE_PADDING,
        top: INITIAL_TOP, // Matches top-12 (12 * 4px = 48px)
      }}
    >
      {content}
    </motion.button>
  );
}
