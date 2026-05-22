import { useEffect, useRef } from "react";
import { Medal, Trophy } from "lucide-react";

import { useDebugLogger } from "../../debug/useDebugLogger";
import { cn } from "@/lib/utils";

export type GameToastKind = "badge" | "point" | "activity";

export interface GameToastProps {
  title: string;
  subtitle?: string;
  emoji?: string;
  accent?: string;
  kind?: GameToastKind;
  className?: string;
}

// Pill-shaped game notification toast.
// Positioning is the parent's responsibility — this component renders its
// visual only (dark pill with colored border, icon/emoji, title, subtitle).
// Parent must render it at the appropriate fixed/absolute position above the Dock.
export function GameToast({
  title,
  subtitle,
  emoji,
  accent,
  kind = "badge",
  className,
}: GameToastProps) {
  const ref = useRef<HTMLDivElement>(null);
  const log = useDebugLogger("GameToast", "src/components/ui/GameToast.tsx");
  const accentColor = accent ?? "var(--meadow-primary)";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    log.logUi("game:toast:shown", {
      text: title,
      subtitle,
      kind,
      placement: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      dims: { width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-w-[260px] items-center gap-2.5 rounded-full border-2 px-4 py-2.5",
        "bg-[var(--bg-ink)] shadow-[0_8px_24px_rgba(0,0,0,0.3)]",
        "animate-game-toast-in",
        className,
      )}
      style={{ borderColor: accentColor }}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base text-white"
        style={{ background: accentColor }}
        aria-hidden="true"
      >
        {emoji ?? (
          kind === "point"
            ? <Trophy className="h-4 w-4" />
            : <Medal className="h-4 w-4" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="text-[13px] font-bold leading-tight text-white"
          style={{ fontFamily: "var(--meadow-font-display)" }}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 text-[11px] leading-tight text-white/70">
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
