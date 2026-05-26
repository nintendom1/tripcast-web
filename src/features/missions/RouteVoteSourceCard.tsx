import { useEffect } from "react";
import { useQuery } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import { useDebugLogger } from "../../debug/useDebugLogger";

type Props = {
  sourceVoteId: string;
  sourceOptionId?: string;
  token: string;
  onNavigate?: (voteId: string) => void;
  /** Card heading — defaults to the original-source phrasing. */
  heading?: string;
};

export default function RouteVoteSourceCard({ sourceVoteId, sourceOptionId, token, onNavigate, heading = "Source Route Vote" }: Props) {
  const log = useDebugLogger("RouteVoteSourceCard", "src/features/missions/RouteVoteSourceCard.tsx");

  const vote = useQuery(tripcastApi.routeVotes.getRouteVoteSummary, {
    token,
    routeVoteId: sourceVoteId,
  });

  useEffect(() => {
    if (vote === undefined) {
      log.logQuery("summary:fetch", "debug", { voteId: sourceVoteId });
    } else if (vote === null) {
      log.logQuery("summary:empty", "warn", { voteId: sourceVoteId });
    } else {
      log.logQuery("summary:loaded", "info", {
        voteId: sourceVoteId,
        status: vote.effectiveStatus,
        optionCount: vote.options.length,
      });
    }
  }, [vote, sourceVoteId, log]);

  if (vote === null) return null;

  if (vote === undefined) {
    return <div className="text-xs text-[var(--ink-3)]">Loading vote…</div>;
  }

  const winningOption = sourceOptionId
    ? vote.options.find((opt) => opt._id === sourceOptionId)
    : null;

  function handleNavigate() {
    log.logUi("action:view-vote", { voteId: sourceVoteId });
    onNavigate?.(sourceVoteId);
  }

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wide">
          {heading}
        </p>
        <StatusBadge status={vote.effectiveStatus} />
      </div>

      <p className="text-sm font-medium text-[var(--ink-1)]">{vote.title}</p>

      {winningOption && (
        <div className="text-xs text-[var(--ink-3)]">
          <span className="font-medium">Winning option:</span> {winningOption.title}
        </div>
      )}

      {onNavigate && (
        <Button size="sm" variant="outline" onClick={handleNavigate} className="self-start">
          View vote
        </Button>
      )}
    </div>
  );
}
