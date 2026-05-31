import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TickerMessage } from "./tickerTypes";
import { log as debugLog } from "../../debug/debugLogger";

export interface TripTickerProps {
  message: TickerMessage | null;
  isPriority?: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * TripTicker: A playful, game-like scrolling banner for notices and fun facts.
 * Sits below the TopBar and scrolls messages from right to left.
 * Pauses on hover/touch. Respects reduced motion.
 */
export function TripTicker({
  message,
  isPriority = false,
  onComplete,
  className
}: TripTickerProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isPaused, setIsPaused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);

  // When message changes, we might want to log it
  React.useEffect(() => {
    if (message) {
      debugLog("info", "TripTicker", "ticker:message_shown", "ui", {
        id: message.id,
        isPriority,
        textPreview: message.text.slice(0, 20) + "..."
      });
    }
  }, [message, isPriority]);

  if (!message) return null;

  // For priority messages, we want them to loop.
  // For fun facts, they scroll once and then disappear (onComplete).

  // Animation duration based on text length to keep speed somewhat consistent
  const duration = Math.max(10, message.text.length * 0.15);

  // Animation variants
  const marqueeVariants = {
    animate: {
      x: ["100vw", "-100%"],
      transition: {
        x: {
          repeat: isPriority ? Infinity : 0,
          repeatType: "loop" as const,
          duration: duration,
          ease: "linear" as const,
        },
      },
    },
    static: {
      x: "10vw", // Slightly visible when paused/static
      transition: { duration: 0.5 }
    }
  };

  const handleAnimationComplete = () => {
    if (!isPriority && onComplete) {
      onComplete();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-7 items-center overflow-hidden border-b border-[var(--line-soft)] bg-[var(--bg-paper)] z-[1]",
        isPriority
          ? "bg-amber-50/80 dark:bg-amber-950/40"
          : "bg-[var(--bg-paper-2)]/50",
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      role="status"
      aria-live={isPriority ? "assertive" : "polite"}
    >
      {/* Ticker Indicator / Label */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 z-[2] flex items-center px-2 shadow-[4px_0_8px_rgba(0,0,0,0.05)]",
        isPriority
          ? "bg-amber-500 text-white"
          : "bg-[var(--ink-3)] text-[var(--bg-paper)]"
      )}>
        <span className="font-[var(--font-mono)] text-[9px] font-black uppercase tracking-tighter">
          {isPriority ? "NOTICE" : "TRIVIA"}
        </span>
      </div>

      <div className="flex-1 overflow-hidden ml-14">
        {shouldReduceMotion ? (
          <div
            className={cn(
              "px-4 text-[11px] font-bold tracking-wide transition-opacity duration-500",
              isPriority ? "text-amber-800 dark:text-amber-300" : "text-[var(--ink-2)]"
            )}
          >
            {message.text}
          </div>
        ) : (
          <motion.div
            key={message.id}
            ref={textRef}
            variants={marqueeVariants}
            animate={isPaused ? "static" : "animate"}
            onAnimationComplete={handleAnimationComplete}
            className={cn(
              "whitespace-nowrap px-4 text-[11px] font-bold tracking-wide",
              isPriority ? "text-amber-800 dark:text-amber-300" : "text-[var(--ink-2)]"
            )}
          >
            {message.text}
          </motion.div>
        )}
      </div>
    </div>
  );
}
