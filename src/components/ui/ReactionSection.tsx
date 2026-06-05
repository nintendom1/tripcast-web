import * as React from "react";
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
  const trayRef = React.useRef<HTMLDivElement>(null);
  const music = useMusicSafe();
  const toggleReaction = useMutation(tripcastApi.reactions.toggleReaction);

  // Clear optimistic state once the server pushes a new snapshot.
  React.useEffect(() => {
    setOptimistic(null);
  }, [reactions]);

  React.useEffect(() => {
    if (!showTray) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
        setShowTray(false);
      }
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
      <div className="relative flex flex-wrap items-center gap-1.5">
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

        <AnimatePresence>
          {showTray && (
            <div
              ref={trayRef}
              className="absolute bottom-full right-0 mb-2 z-50"
            >
              <ReactionTray
                currentSelection={myReaction}
                onSelect={handleToggle}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
