import { useEffect, useRef, useState } from "react";
import { Bug } from "lucide-react";
import { isEnabled, getLogs, subscribe } from "./debugLogger";
import {
  getActiveUiContext,
  getFloatingDebugSettings,
  subscribeActiveUiContext,
  type ActiveUiContext,
  type FloatingDebugSettings,
} from "./activeUiContext";

export function DebugChip({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [logCount, setLogCount] = useState(() => getLogs().length);
  const [activeContext, setActiveContext] = useState<ActiveUiContext | null>(getActiveUiContext);
  const [settings, setSettings] = useState<FloatingDebugSettings>(getFloatingDebugSettings);
  const [blink, setBlink] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const activeLabel = activeContext?.label ?? "none";
  const activeName = activeContext?.sheetName ?? "none";
  const compactContext = activeContext ? `${activeLabel} -> ${activeName}` : "none";
  const sourceLabel = activeContext?.sourceLabel ?? activeContext?.source ?? "Unknown";
  const sourceLine = settings.showSource ? `Source: ${sourceLabel}` : null;
  const ariaContext = settings.buttonMode === "log-count"
    ? ""
    : ` Active sheet: ${activeName}.${settings.showSource ? ` Source: ${sourceLabel}.` : ""}`;

  if (settings.buttonMode === "compact-context") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open debug panel.${ariaContext}`}
        className={`flex max-w-[190px] items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-md transition-colors duration-200 ${
          blink
            ? "bg-amber-400 text-black"
            : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-80 hover:opacity-100"
        }`}
      >
        <Bug className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">Debug · {compactContext}</span>
      </button>
    );
  }

  if (settings.buttonMode === "detailed-context") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open debug panel.${ariaContext}`}
        className={`grid max-w-[210px] gap-0.5 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold leading-tight shadow-md transition-colors duration-200 ${
          blink
            ? "bg-amber-400 text-black"
            : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-85 hover:opacity-100"
        }`}
      >
        <span className="flex items-center gap-1 font-bold">
          <Bug className="h-3 w-3 shrink-0" aria-hidden />
          Debug ({logCount})
        </span>
        <span className="truncate">Active: {activeName}</span>
        {sourceLine ? <span className="truncate">{sourceLine}</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open debug panel"
      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold shadow-md transition-colors duration-200 ${
        blink
          ? "bg-amber-400 text-black"
          : "bg-[var(--ink-1)] text-[var(--ink-on-dark)] opacity-75 hover:opacity-100"
      }`}
    >
      <Bug className="h-3 w-3" aria-hidden />
      {logCount}
    </button>
  );
}
