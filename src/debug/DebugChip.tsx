import { useEffect, useRef, useState } from "react";
import { Bug } from "lucide-react";
import { motion, useAnimationControls, type PanInfo } from "framer-motion";
import { isEnabled, getLogs, subscribe } from "./debugLogger";
import {
  getActiveUiContext,
  getFloatingDebugSettings,
  subscribeActiveUiContext,
  type ActiveUiContext,
  type FloatingDebugSettings,
} from "./activeUiContext";

const EDGE_PADDING = 12;
const DRAG_THRESHOLD = 5;

export function DebugChip({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [logCount, setLogCount] = useState(() => getLogs().length);
  const [activeContext, setActiveContext] = useState<ActiveUiContext | null>(getActiveUiContext);
  const [settings, setSettings] = useState<FloatingDebugSettings>(getFloatingDebugSettings);
  const [blink, setBlink] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useAnimationControls();
  const chipRef = useRef<HTMLDivElement>(null);

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
    };
  }, []);

  if (!enabled) return null;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!chipRef.current) return;

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

    if (minDist === distLeft) {
      targetX = EDGE_PADDING;
    } else if (minDist === distRight) {
      targetX = vw - rect.width - EDGE_PADDING;
    } else if (minDist === distTop) {
      targetY = EDGE_PADDING;
    } else if (minDist === distBottom) {
      targetY = vh - rect.height - EDGE_PADDING;
    }

    // Clamp to viewport
    targetX = Math.max(EDGE_PADDING, Math.min(vw - rect.width - EDGE_PADDING, targetX));
    targetY = Math.max(EDGE_PADDING, Math.min(vh - rect.height - EDGE_PADDING, targetY));

    // Calculate the new transform values relative to the initial CSS position (right: 12, top: 48).
    const baseLeft = vw - rect.width - EDGE_PADDING;
    const baseTop = 48;

    controls.start({
      x: targetX - baseLeft,
      y: targetY - baseTop,
      transition: { type: "spring", stiffness: 300, damping: 30 },
    });
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
      onTap={onOpen}
      aria-label={`Open debug panel.${ariaContext}`}
      className="pointer-events-auto fixed z-[100] appearance-none border-none bg-transparent p-0"
      style={{
        right: EDGE_PADDING,
        top: 48, // Matches top-12 (12 * 4px = 48px)
      }}
    >
      {content}
    </motion.button>
  );
}
