import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { AnimatePresence } from "framer-motion";
import { tripcastApi, type ReactionSummary } from "@/convex/tripcastApi";
import { ReactionTray, ReactionBadge, ReactionButton } from "./ReactionTray";
import { useMusicSafe } from "@/providers/MusicProvider";

export type ReactionTargetType = "checkpoint" | "mission" | "route_vote";

interface ReactionSectionProps {
  targetId: string;
  targetType: ReactionTargetType;
  reactions?: ReactionSummary;
  token?: string;
  className?: string;
}

function toCountMap(entries: ReactionSummary["entries"]): Map<string, number> {
  const m = new Map<string, number>();
  for (const { emoji, count } of entries) m.set(emoji, count);
  return m;
}

function fromCountMap(m: Map<string, number>): ReactionSummary["entries"] {
  return Array.from(m, ([emoji, count]) => ({ emoji, count }));
}

export function computeNextReactions(
  current: ReactionSummary,
  emoji: string,
): ReactionSummary {
  const counts = toCountMap(current.entries);
  const myReaction = current.myReaction;

  if (myReaction === emoji) {
    const next = (counts.get(emoji) ?? 1) - 1;
    if (next <= 0) counts.delete(emoji);
    else counts.set(emoji, next);
    return { entries: fromCountMap(counts) };
  }
  if (myReaction) {
    const prev = (counts.get(myReaction) ?? 1) - 1;
    if (prev <= 0) counts.delete(myReaction);
    else counts.set(myReaction, prev);
  }
  counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  return { entries: fromCountMap(counts), myReaction: emoji };
}

export function ReactionSection({
  targetId,
  targetType,
  reactions,
  token,
  className,
}: ReactionSectionProps) {
  const [showTray, setShowTray] = React.useState(false);
  const [optimistic, setOptimistic] = React.useState<ReactionSummary | null>(null);
  const [trayPos, setTrayPos] = React.useState<{ bottom: number; right: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const music = useMusicSafe();
  const toggleReaction = useMutation(tripcastApi.reactions.toggleReaction);

  // Clear optimistic state once the server pushes a new snapshot.
  React.useEffect(() => {
    setOptimistic(null);
  }, [reactions]);

  // Compute portal-anchored tray position relative to the badge container so
  // the tray escapes any ancestor with `overflow: hidden` (rail cards / vote
  // cards) but still visually aligns above the + button.
  React.useEffect(() => {
    if (!showTray || !containerRef.current) {
      setTrayPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setTrayPos({
      bottom: window.innerHeight - rect.top + 8,
      right: window.innerWidth - rect.right,
    });
  }, [showTray]);

  // Close on scroll / resize — the fixed-position tray would otherwise drift
  // away from its anchor without continuous recomputation.
  React.useEffect(() => {
    if (!showTray) return;
    const close = () => setShowTray(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showTray]);

  React.useEffect(() => {
    if (!showTray) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (trayRef.current && trayRef.current.contains(target)) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setShowTray(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTray]);

  if (!token) return null;

  const effective: ReactionSummary = optimistic ?? reactions ?? { entries: [] };
  const sorted = effective.entries.slice().sort((a, b) => b.count - a.count);
  const myReaction = effective.myReaction;

  const handleToggle = async (emoji: string) => {
    const next = computeNextReactions(effective, emoji);
    setOptimistic(next);
    setShowTray(false);
    music.sfx("bubble");
    try {
      await toggleReaction({ token, targetId, targetType, emoji });
    } catch (e) {
      console.error("Failed to toggle reaction", e);
      setOptimistic(null);
    }
  };

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
        {sorted.map(({ emoji, count }) => (
          <ReactionBadge
            key={emoji}
            emoji={emoji}
            count={count}
            isMine={myReaction === emoji}
            onClick={() => handleToggle(emoji)}
            onLongPress={() => setShowTray(true)}
          />
        ))}

        <ReactionButton
          onClick={() => setShowTray(!showTray)}
          onLongPress={() => setShowTray(true)}
        />
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showTray && trayPos && (
              <div
                ref={trayRef}
                className="fixed z-[1000]"
                style={{ bottom: trayPos.bottom, right: trayPos.right }}
                onClick={(e) => e.stopPropagation()}
              >
                <ReactionTray
                  currentSelection={myReaction}
                  onSelect={handleToggle}
                />
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
