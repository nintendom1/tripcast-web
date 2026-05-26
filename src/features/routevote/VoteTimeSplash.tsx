import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Vote } from "lucide-react";

import { tripcastApi, type VisibleRouteVote } from "../../convex/tripcastApi";
import { formatTimeRemaining } from "../../lib/routeVoteUtils";

const VOTE_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const SPLASH_DURATION_MS = 5000;

type VoteTimeSplashProps = {
  token: string;
  enabled: boolean;
  onOpenVotes: () => void;
};

function selectVoteTimeSplashTarget(
  votes: VisibleRouteVote[] | undefined,
  now: number,
  dismissedVoteIds: Set<string>,
) {
  if (!votes) return null;
  return (
    votes.find((vote) => {
      const msRemaining = vote.expiresAt - now;
      return (
        !dismissedVoteIds.has(vote._id) &&
        vote.effectiveStatus === "active" &&
        msRemaining > 0 &&
        msRemaining <= VOTE_TIME_WINDOW_MS &&
        !vote.mySubmission &&
        !vote.myViewState?.seenAt
      );
    }) ?? null
  );
}

export default function VoteTimeSplash({
  token,
  enabled,
  onOpenVotes,
}: VoteTimeSplashProps) {
  const votes = useQuery(
    tripcastApi.routeVotes.listVisibleRouteVotes,
    enabled ? { token } : "skip",
  );
  const [dismissedVoteIds, setDismissedVoteIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const targetVote = useMemo(
    () => selectVoteTimeSplashTarget(votes, now, dismissedVoteIds),
    [dismissedVoteIds, now, votes],
  );

  useEffect(() => {
    if (!targetVote) return;
    const id = window.setTimeout(() => {
      setDismissedVoteIds((prev) => new Set(prev).add(targetVote._id));
    }, SPLASH_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [targetVote]);

  function dismissAndOpen() {
    if (!targetVote) return;
    setDismissedVoteIds((prev) => new Set(prev).add(targetVote._id));
    onOpenVotes();
  }

  return (
    <AnimatePresence>
      {targetVote ? (
        <motion.button
          key={targetVote._id}
          type="button"
          aria-label={`Cast your vote: ${targetVote.title}`}
          onClick={dismissAndOpen}
          className="absolute inset-0 z-[19] overflow-hidden bg-black/35 text-white backdrop-blur-[2px]"
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <motion.span
            aria-hidden="true"
            className="absolute left-[-15vw] right-[-15vw] top-1/2 h-36 -translate-y-1/2 -rotate-6 bg-[linear-gradient(135deg,rgba(122,156,220,0.96),rgba(255,139,74,0.92),rgba(28,31,58,0.96))] shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
            initial={{ x: "-110%" }}
            animate={{ x: 0 }}
            exit={{ x: "110%" }}
            transition={{ duration: 0.42, ease: [0.22, 0.9, 0.3, 1] }}
          />
          <span className="relative z-10 flex h-full items-center justify-center px-6 text-center">
            <span className="grid gap-3">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/35 bg-white/14 shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
                <Vote className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="font-[var(--font-mono)] text-[11px] font-black uppercase tracking-[0.28em] text-white/70">
                Vote Time
              </span>
              <span className="font-[var(--font-display)] text-5xl font-black leading-none tracking-normal text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.42)]">
                Cast your Vote
              </span>
              <span className="mx-auto max-w-[320px] truncate text-sm font-semibold text-white/85">
                {targetVote.title} · {formatTimeRemaining(targetVote.expiresAt)}
              </span>
            </span>
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

export { selectVoteTimeSplashTarget };
