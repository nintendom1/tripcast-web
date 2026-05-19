import { useEffect, useRef, useState } from "react";
import { Bug } from "lucide-react";
import { isEnabled, getLogs, subscribe } from "./debugLogger";

export function DebugChip({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabledState] = useState(isEnabled);
  const [logCount, setLogCount] = useState(() => getLogs().length);
  const [blink, setBlink] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribe(() => {
      setEnabledState(isEnabled());
      setLogCount(getLogs().length);
      setBlink(true);
      if (blinkTimerRef.current !== null) clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = setTimeout(() => setBlink(false), 500);
    });
  }, []);

  if (!enabled) return null;

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
