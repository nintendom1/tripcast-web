import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TickerMessage } from "./tickerTypes";
import { log as debugLog } from "../../debug/debugLogger";

export interface TripTickerProps {
  message: TickerMessage | null;
  isPriority?: boolean;
  onComplete?: () => void;
  className?: string;
}

const PX_PER_SECOND = 70;

export function TripTicker({
  message,
  isPriority = false,
  onComplete,
  className,
}: TripTickerProps) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    if (message) {
      debugLog("info", "TripTicker", "ticker:message_shown", "ui", {
        id: message.id,
        isPriority,
        textPreview: message.text.slice(0, 20) + "...",
      });
    }
  }, [message, isPriority]);

  // Measured-pixel marquee. Starts fully right-offscreen, ends fully left-offscreen.
  // Priority loops indefinitely; fun facts fire onComplete on true completion only.
  React.useLayoutEffect(() => {
    if (!message || shouldReduceMotion) return;
    const container = containerRef.current;
    const scroller = scrollerRef.current;
    if (!container || !scroller) return;

    const containerWidth = container.clientWidth;
    const textWidth = scroller.scrollWidth;
    const distance = containerWidth + textWidth;
    const duration = Math.max(1, distance / PX_PER_SECOND);

    x.set(containerWidth);
    const controls = animate(x, -textWidth, {
      duration,
      ease: "linear",
      repeat: isPriority ? Infinity : 0,
      repeatType: "loop",
    });
    controlsRef.current = controls;

    if (!isPriority) {
      controls.then(
        () => {
          if (onComplete) onComplete();
        },
        () => {
          // Stopped via cleanup — do not fire onComplete.
        },
      );
    }

    return () => {
      controls.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, isPriority, shouldReduceMotion]);

  // Pause/resume via framer's playback controls — keeps the active animation
  // alive across hover so onComplete only fires at true completion.
  React.useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (isPaused) controls.pause();
    else controls.play();
  }, [isPaused]);

  // Always render the strip so the header height is stable across enable/disable.
  if (!message) {
    return (
      <div
        aria-hidden="true"
        className={cn("relative h-[22px] bg-[var(--bg-paper)] z-[1]", className)}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[22px] items-center overflow-hidden bg-[var(--bg-paper)] z-[1]",
        isPriority
          ? "bg-amber-50/80 dark:bg-amber-950/40"
          : "bg-[var(--bg-paper-2)]/50",
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      role="status"
      aria-live={isPriority ? "assertive" : "polite"}
    >
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 z-[2] flex items-center px-2 shadow-[4px_0_8px_rgba(0,0,0,0.05)]",
          isPriority
            ? "bg-amber-500 text-white"
            : "bg-[var(--ink-3)] text-[var(--bg-paper)]",
        )}
      >
        <span className="font-[var(--font-mono)] text-[10px] font-black uppercase tracking-tighter leading-none">
          {isPriority ? "NOTICE" : "TRIVIA"}
        </span>
      </div>

      <div className="flex-1 overflow-hidden ml-14">
        {shouldReduceMotion ? (
          <div
            className={cn(
              "px-4 text-[14px] font-bold tracking-wide leading-[18px]",
              isPriority ? "text-amber-800 dark:text-amber-300" : "text-[var(--ink-2)]",
            )}
          >
            {message.text}
          </div>
        ) : (
          <motion.div
            key={message.id}
            ref={scrollerRef}
            style={{ x }}
            className={cn(
              "whitespace-nowrap pr-8 text-[14px] font-bold tracking-wide leading-[18px]",
              isPriority ? "text-amber-800 dark:text-amber-300" : "text-[var(--ink-2)]",
            )}
          >
            {message.text}
          </motion.div>
        )}
      </div>
    </div>
  );
}
