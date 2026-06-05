import * as React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const REACTION_PRESETS = ["❤️", "👍", "😲", "😡", "😹", "😕"];

interface ReactionTrayProps {
  onSelect: (emoji: string) => void;
  currentSelection?: string;
  className?: string;
}

export function ReactionTray({ onSelect, currentSelection, className }: ReactionTrayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 10 }}
      className={cn(
        "flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1.5 shadow-lg",
        className
      )}
    >
      {REACTION_PRESETS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(emoji);
          }}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full text-xl transition-all hover:bg-[var(--meter-track)] active:scale-90",
            currentSelection === emoji && "bg-[var(--meter-track)] ring-1 ring-[var(--flag)]"
          )}
        >
          {emoji}
        </button>
      ))}
    </motion.div>
  );
}

interface ReactionBadgeProps {
  emoji: string;
  count: number;
  isMine: boolean;
  onClick: (e: React.MouseEvent) => void;
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
}

export function ReactionBadge({ emoji, count, isMine, onClick, onLongPress }: ReactionBadgeProps) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLongPress = React.useRef(false);

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    wasLongPress.current = false;
    timerRef.current = setTimeout(() => {
      onLongPress(e);
      wasLongPress.current = true;
      timerRef.current = null;
    }, 500);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!wasLongPress.current) {
          onClick(e);
        }
        wasLongPress.current = false;
      }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        isMine
          ? "border-[var(--flag)] bg-[color-mix(in_oklab,var(--flag)_10%,transparent)] text-[var(--ink-1)]"
          : "border-[var(--line-soft)] bg-[var(--bg-paper)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]"
      )}
    >
      <span>{emoji}</span>
      <span>{count}</span>
    </button>
  );
}

interface ReactionButtonProps {
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

export function ReactionButton({ onLongPress, onClick }: ReactionButtonProps) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLongPress = React.useRef(false);

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    wasLongPress.current = false;
    timerRef.current = setTimeout(() => {
      onLongPress(e);
      wasLongPress.current = true;
      timerRef.current = null;
    }, 500);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!wasLongPress.current) {
          onClick(e);
        }
        wasLongPress.current = false;
      }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-[var(--line-soft)] text-[var(--ink-3)] hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}
