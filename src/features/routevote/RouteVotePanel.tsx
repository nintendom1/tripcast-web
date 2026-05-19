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
import {
  Sheet,
  SheetBackButton,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { ChoiceList, ChoiceItem } from "../../components/rpg/ChoiceList";
import { StatBar } from "../../components/rpg/StatBar";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import { formatTimeRemaining, getRouteVoteMapBounds } from "../../lib/routeVoteUtils";
import { PendingNotice } from "../../components/resilience/PendingNotice";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";

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
      className="w-full rounded-2xl bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-[var(--font-display)] text-sm font-bold leading-snug text-[var(--ink-1)]">
          {vote.title}
        </span>
        <StatusBadge status={vote.effectiveStatus} />
      </div>
      <div className="mt-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {formatTimeRemaining(vote.expiresAt)} · {vote.options.length} options
        {vote.totalSubmissions !== undefined && ` · ${vote.totalSubmissions} votes`}
      </div>
      {vote.mySubmission && (
        <div className="mt-1 text-xs italic text-[var(--ink-3)]">You voted</div>
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
  const music = useMusicSafe();
  const log = useDebugLogger("RouteVotePanel", "src/features/routevote/RouteVotePanel.tsx");

  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(
    () => new Set(vote.mySubmission?.selectedOptionIds ?? []),
  );
  const [comment, setComment] = useState(vote.mySubmission?.comment ?? "");
  const [commentVisibility, setCommentVisibility] = useState<CommentVisibility>(
    vote.mySubmission?.commentVisibility ?? "public",
  );
  const [anonymous, setAnonymous] = useState(vote.mySubmission?.anonymous ?? false);
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
    log.logInteraction("vote:submit", { voteId: vote._id, optionCount: selectedOptionIds.size, anonymous });
    setError(null);
    setIsSubmitting(true);
    try {
      await submitVote({
        token,
        routeVoteId: vote._id,
        selectedOptionIds: Array.from(selectedOptionIds),
        comment: comment.trim() || undefined,
        commentVisibility,
        anonymous: anonymous || undefined,
      });
      log.logInteraction("submit:success", { voteId: vote._id });
      music.sfx("vote");
    } catch (e) {
      log.error("submit:error", { message: e instanceof Error ? e.message : String(e) });
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
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={commentVisibility === "traveler_only"}
                onChange={(e) => setCommentVisibility(e.target.checked ? "traveler_only" : "public")}
              />
              Private (traveler only)
            </label>
            {commentVisibility === "public" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Post as anonymous
              </label>
            )}
          </div>
          <div className="flex justify-end">
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
            <div key={c.submissionId} className="text-sm border rounded-md px-3 py-2 bg-muted/30 flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{c.author}</span>
              <span>{c.comment}</span>
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
  const votes = useQuery(tripcastApi.routeVotes.listVisibleRouteVotes, { token });
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const music = useMusicSafe();
  const log = useDebugLogger("RouteVotePanel", "src/features/routevote/RouteVotePanel.tsx");

  const selectedVote = votes?.find((v) => v._id === selectedVoteId) ?? null;

  function handleBack() {
    log.logInteraction("view:change", { from: "detail", to: "list" });
    music.sfx("page");
    setSelectedVoteId(null);
    onVoteOverlayChange(null);
    onRequestFitMap(null);
  }

  function handleOptionFocus(lat: number, lon: number) {
    const panelPadding = Math.round(window.innerHeight * 0.62) + 20;
    onRequestFitMap([[lon - 0.01, lat - 0.01], [lon + 0.01, lat + 0.01]], panelPadding);
  }

  const showBack = Boolean(selectedVote);
  const headerTitle = selectedVote ? "Vote" : "Route votes";

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className="z-[10] max-h-[80dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
        data-role="route-votes-sheet"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-4 pt-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {showBack ? (
              <SheetBackButton aria-label="Back to votes list" onClick={handleBack} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <SheetKicker dotColor="var(--flag)">Voting</SheetKicker>
              <SheetTitle className="truncate font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                {selectedVote ? selectedVote.title : headerTitle}
              </SheetTitle>
            </div>
          </div>
          <SheetCloseButton aria-label="Close votes panel" />
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 pb-4 pt-3">
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
                {votes === undefined ? (
                  <PendingNotice
                    label="Loading votes..."
                    className="py-6 text-center text-sm text-[var(--ink-3)]"
                  />
                ) : votes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--ink-3)]">
                    No active votes right now.
                  </p>
                ) : (
                  votes.map((vote) => (
                    <VoteCard
                      key={vote._id}
                      vote={vote}
                      onSelect={() => {
                        log.logInteraction("view:change", { from: "list", to: "detail", voteId: vote._id });
                        music.sfx("page");
                        setSelectedVoteId(vote._id);
                      }}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
