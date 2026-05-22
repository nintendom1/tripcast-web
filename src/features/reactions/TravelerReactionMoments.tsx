import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Reaction } from "../../convex/tripcastApi";
import { GameToast } from "../../components/ui/GameToast";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";

type Props = {
  token: string;
};

/**
 * Traveler-facing reaction moments: subscribes to unseen Follower reactions and
 * shows them one at a time as a GameToast, marking them seen as they queue.
 */
export default function TravelerReactionMoments({ token }: Props) {
  const unseen = useQuery(tripcastApi.reactions.travelerListUnseenReactions, { token });
  const markSeen = useMutation(tripcastApi.reactions.travelerMarkReactionsSeen);
  const music = useMusicSafe();
  const log = useDebugLogger(
    "TravelerReactionMoments",
    "src/features/reactions/TravelerReactionMoments.tsx",
  );

  const [queue, setQueue] = useState<Reaction[]>([]);
  const [current, setCurrent] = useState<Reaction | null>(null);
  const enqueuedRef = useRef<Set<string>>(new Set());

  // Enqueue newly-arrived unseen reactions (once each), then mark them seen so
  // they do not re-toast on reload.
  useEffect(() => {
    if (!unseen || unseen.length === 0) return;
    const fresh = unseen.filter((r) => !enqueuedRef.current.has(r._id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => enqueuedRef.current.add(r._id));
    setQueue((q) => [...q, ...fresh]);
    log.logUi("reaction:queued", { count: fresh.length });
    markSeen({ token, ids: fresh.map((r) => r._id) }).catch(() => {
      // best-effort; will re-queue next load if it failed
    });
  }, [unseen, token, markSeen, log]);

  // Show the next queued reaction once nothing is showing.
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const timer = window.setTimeout(() => {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
      music.sfx("toast");
    }, 200);
    return () => window.clearTimeout(timer);
  }, [current, queue, music]);

  // Auto-dismiss the current reaction moment.
  useEffect(() => {
    if (current === null) return;
    log.logUi("reaction:show", { emoji: current.emoji, reactor: current.reactorName });
    const timer = window.setTimeout(() => setCurrent(null), 3000);
    return () => window.clearTimeout(timer);
  }, [current, log]);

  return (
    <AnimatePresence>
      {current ? (
        <motion.div
          key={current._id}
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" as const }}
          className="pointer-events-none fixed left-1/2 top-16 z-[60] -translate-x-1/2"
        >
          <GameToast
            kind="activity"
            emoji={current.emoji}
            accent="var(--meadow-primary)"
            title={`${current.reactorName} reacted`}
            subtitle={`${current.emoji} to your trip`}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
