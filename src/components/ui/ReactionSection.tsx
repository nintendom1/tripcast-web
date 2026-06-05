import * as React from "react";
import { useMutation } from "convex/react";
import { AnimatePresence } from "framer-motion";
import { tripcastApi, type ReactionSummary } from "@/convex/tripcastApi";
import { ReactionTray, ReactionBadge, ReactionButton } from "./ReactionTray";
import { useMusicSafe } from "@/providers/MusicProvider";

interface ReactionSectionProps {
  targetId: string;
  targetType: "checkpoint" | "mission";
  reactions?: ReactionSummary;
  token?: string;
  className?: string;
}

export function ReactionSection({
  targetId,
  targetType,
  reactions,
  token,
  className,
}: ReactionSectionProps) {
  if (!token) return null;
  const [showTray, setShowTray] = React.useState(false);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const music = useMusicSafe();
  const toggleReaction = useMutation(tripcastApi.reactions.toggleReaction);

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

  const handleToggle = async (emoji: string) => {
    try {
      music.sfx("bubble");
      await toggleReaction({
        token,
        targetId,
        targetType,
        emoji,
      });
      setShowTray(false);
    } catch (e) {
      console.error("Failed to toggle reaction", e);
    }
  };

  const counts = reactions?.counts ?? {};
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const myReaction = reactions?.myReaction;

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <div className="relative flex flex-wrap items-center gap-1.5">
        {entries.map(([emoji, count]) => (
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
