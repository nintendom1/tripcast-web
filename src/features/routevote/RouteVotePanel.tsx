import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  tripcastApi,
  type RouteVoteMapOverlay,
  type CommentVisibility,
  type VisibleRouteVote,
} from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { ChoiceList, ChoiceItem } from "../../components/rpg/ChoiceList";
import { StatBar } from "../../components/rpg/StatBar";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import { formatTimeRemaining, getRouteVoteMapBounds } from "../../lib/routeVoteUtils";

type RouteVotePanelProps = {
  token: string;
  onClose: () => void;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null, paddingBottom?: number) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
};

type VoteCardProps = {
  vote: VisibleRouteVote;
  onSelect: () => void;
};

function VoteCard({ vote, onSelect }: VoteCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-md border bg-card p-3 hover:bg-accent transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm">{vote.title}</span>
        <StatusBadge status={vote.effectiveStatus} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatTimeRemaining(vote.expiresAt)} · {vote.options.length} options
        {vote.totalSubmissions !== undefined && ` · ${vote.totalSubmissions} votes`}
      </div>
      {vote.mySubmission && (
        <div className="mt-1 text-xs text-muted-foreground italic">
          You voted
        </div>
      )}
    </button>
  );
}

type VoteDetailProps = {
  token: string;
  vote: VisibleRouteVote;
  onBack: () => void;
  onOptionFocus: (lat: number, lon: number) => void;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null, paddingBottom?: number) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
};

function VoteDetail({
  token,
  vote,
  onBack,
  onOptionFocus,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
}: VoteDetailProps) {
  const submitVote = useMutation(tripcastApi.routeVotes.submitRouteVote);
  const markSeen = useMutation(tripcastApi.routeVotes.markRouteVoteSeen);

  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(
    () => new Set(vote.mySubmission?.selectedOptionIds ?? []),
  );
  const [comment, setComment] = useState(vote.mySubmission?.comment ?? "");
  const [commentVisibility, setCommentVisibility] = useState<CommentVisibility>(
    vote.mySubmission?.commentVisibility ?? "public",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlay = useQuery(
    tripcastApi.routeVotes.getRouteVoteMapOverlay,
    { token, routeVoteId: vote._id },
  );

  useEffect(() => {
    markSeen({ token, routeVoteId: vote._id }).catch(() => {});
  }, [token, vote._id, markSeen]);

  useEffect(() => {
    if (overlay === undefined) return;
    const optionNumberById = Object.fromEntries(
      vote.options.map((option, index) => [option._id, index + 1]),
    );
    onVoteOverlayChange(overlay, optionNumberById);

    if (!overlay || overlay.coordinateOptions.length === 0) {
      onRequestFitMap(null);
      return;
    }

    const origin = overlay.travelerLocation ?? fallbackOrigin;
    const bounds = getRouteVoteMapBounds(overlay.coordinateOptions, origin);
    if (!bounds) {
      onRequestFitMap(null);
      return;
    }

    // Panel covers ~60 dvh; add proportional bottom padding so bounds stay visible above it
    const panelPadding = Math.round(window.innerHeight * 0.62) + 20;
    onRequestFitMap(bounds, panelPadding);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, fallbackOrigin, vote.options]);

  function toggleOption(id: string) {
    setSelectedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit = vote.effectiveStatus === "active" && selectedOptionIds.size > 0 && !isSubmitting;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await submitVote({
        token,
        routeVoteId: vote._id,
        selectedOptionIds: Array.from(selectedOptionIds),
        comment: comment.trim() || undefined,
        commentVisibility,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const total = vote.totalSubmissions ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <StatusBadge status={vote.effectiveStatus} />
        <span className="ml-auto text-xs text-muted-foreground">{formatTimeRemaining(vote.expiresAt)}</span>
      </div>

      <DialogueBox title={vote.title}>
        {vote.description && (
          <p className="text-sm text-muted-foreground mb-3">{vote.description}</p>
        )}
        <ChoiceList>
          {vote.options.map((option, i) => {
            const count = vote.optionVoteCounts?.[option._id] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const hasCoords = option.lat !== undefined && option.lon !== undefined;
            return (
              <div key={option._id} className="flex flex-col gap-1">
                <ChoiceItem
                  index={i + 1}
                  selected={selectedOptionIds.has(option._id)}
                  onClick={() => {
                    toggleOption(option._id);
                    if (hasCoords && option.lat !== undefined && option.lon !== undefined) {
                      onOptionFocus(option.lat, option.lon);
                    }
                  }}
                  disabled={vote.effectiveStatus !== "active"}
                >
                  <span className="font-medium">{option.title}</span>
                  {option.locationLabel && (
                    <span className="block text-xs text-muted-foreground">{option.locationLabel}</span>
                  )}
                  {option.description && (
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  )}
                  {option.estimatedCostUsd !== undefined && (
                    <span className="block text-xs text-muted-foreground">${option.estimatedCostUsd.toFixed(2)}</span>
                  )}
                </ChoiceItem>
                {vote.optionVoteCounts !== undefined && (
                  <div className="pl-8 pr-3 flex items-center gap-2">
                    <StatBar value={pct} className="flex-1" />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {count} {count === 1 ? "vote" : "votes"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </ChoiceList>
      </DialogueBox>

      {vote.effectiveStatus === "active" && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Add a comment… (optional)"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={commentVisibility === "traveler_only"}
                onChange={(e) => setCommentVisibility(e.target.checked ? "traveler_only" : "public")}
              />
              Private (traveler only)
            </label>
            <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
              {isSubmitting ? "Submitting…" : vote.mySubmission ? "Update Vote" : "Submit Vote"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}

      {vote.visibleComments.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comments</span>
          {vote.visibleComments.map((c) => (
            <div key={c.submissionId} className="text-sm border rounded-md px-3 py-2 bg-muted/30">
              {c.comment}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RouteVotePanel({
  token,
  onClose,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
}: RouteVotePanelProps) {
  const votes = useQuery(tripcastApi.routeVotes.listVisibleRouteVotes, { token }) ?? [];
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);

  const selectedVote = votes.find((v) => v._id === selectedVoteId) ?? null;

  function handleBack() {
    setSelectedVoteId(null);
    onVoteOverlayChange(null);
    onRequestFitMap(null);
  }

  function handleOptionFocus(lat: number, lon: number) {
    const panelPadding = Math.round(window.innerHeight * 0.62) + 20;
    onRequestFitMap([[lon - 0.01, lat - 0.01], [lon + 0.01, lat + 0.01]], panelPadding);
  }

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ duration: 0.22, ease: "easeOut" as const }}
      className="absolute bottom-0 left-0 right-0 z-[4] bg-background border-t max-h-[60vh] overflow-y-auto flex flex-col"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="sticky top-0 bg-background border-b flex items-center justify-between px-4 py-3 z-[1]">
        <span className="font-semibold text-sm">
          {selectedVote ? selectedVote.title : "Votes"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Close
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {selectedVote ? (
            <motion.div
              key={selectedVote._id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <VoteDetail
                token={token}
                vote={selectedVote}
                onBack={handleBack}
                onOptionFocus={handleOptionFocus}
                onVoteOverlayChange={onVoteOverlayChange}
                onRequestFitMap={onRequestFitMap}
                fallbackOrigin={fallbackOrigin}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-2"
            >
              {votes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No active votes right now.
                </p>
              ) : (
                votes.map((vote) => (
                  <VoteCard key={vote._id} vote={vote} onSelect={() => setSelectedVoteId(vote._id)} />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
