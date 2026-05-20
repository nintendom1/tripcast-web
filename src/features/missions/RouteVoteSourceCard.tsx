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
};

export default function RouteVoteSourceCard({ sourceVoteId, sourceOptionId, token, onNavigate }: Props) {
  const log = useDebugLogger("RouteVoteSourceCard", "src/features/missions/RouteVoteSourceCard.tsx");

  const vote = useQuery(tripcastApi.routeVotes.travelerGetRouteVoteDetail, {
    token,
    routeVoteId: sourceVoteId,
  });

  if (vote === null) return null;

  if (vote === undefined) {
    return <div className="text-xs text-muted-foreground">Loading vote…</div>;
  }

  const winningOption = sourceOptionId
    ? vote.options.find((opt) => opt._id === sourceOptionId)
    : null;

  function handleNavigate() {
    log.logUi("action:view-vote", { voteId: sourceVoteId });
    onNavigate?.(sourceVoteId);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Source Route Vote
        </p>
        <StatusBadge status={vote.effectiveStatus} />
      </div>

      <p className="text-sm font-medium text-navy">{vote.title}</p>

      {winningOption && (
        <div className="text-xs text-muted-foreground">
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
