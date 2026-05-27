import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckSquare, Plus } from "lucide-react";
import {
  tripcastApi,
  type RouteVoteMapOverlay,
  type CommentVisibility,
  type Role,
  type RouteVoteListItem,
  type VisibleRouteVote,
  type LinkedMissionAction,
} from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetBackButton,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { FilterButton } from "../../components/ui/FilterButton";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { ChoiceList, ChoiceItem } from "../../components/rpg/ChoiceList";
import { StatBar } from "../../components/rpg/StatBar";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import {
  formatTimeRemaining,
  getRouteVoteMapBounds,
  matchesVoteStatusFilter,
  VOTE_FILTER_OPTIONS,
  type VoteStatusFilter,
} from "../../lib/routeVoteUtils";
import { PendingNotice } from "../../components/resilience/PendingNotice";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useCenteringCalibration } from "../../debug/useCenteringCalibration";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { TERMS } from "../../copy/terminology";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import CreateRouteVoteForm from "./CreateRouteVoteForm";
import { cn } from "@/lib/utils";

type RouteVotePanelProps = {
  token: string;
  /** Controls visibility. Kept mounted while closed so the close transition plays. */
  open: boolean;
  role?: Role;
  onClose: () => void;
  onRequestCoordinatePick?: (
    optionIndex: number,
    callback: (coord: { lat: number; lon: number }) => void,
  ) => void;
  referenceLocation?: { lat: number; lon: number } | null;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
  isPickingCoordinate?: boolean;
  pendingOpenVoteId?: string | null;
  onClearPendingVoteId?: () => void;
  onRequestOpenMissionDetail?: (missionId: string) => void;
  debugSource?: { source: string; sourceLabel: string };
};

type View = "list" | "create" | "detail";
type PanelVote = VisibleRouteVote | RouteVoteListItem;

type VoteCardProps = {
  vote: PanelVote;
  showTallies: boolean;
  onSelect: () => void;
};

function voteCode(id: string): string {
  return `V-${id.slice(-3).toUpperCase()}`;
}

function getVoteTotal(vote: PanelVote) {
  return vote.totalSubmissions ?? 0;
}

function OptionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Selected" : "Not selected"}
      className={cn(
        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors",
        checked
          ? "border-[var(--flag)] bg-[var(--flag)] text-[var(--ink-on-brand)]"
          : "border-[var(--line-soft)] bg-[var(--bg-card)] text-transparent",
      )}
    >
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function VoteCard({ vote, showTallies, onSelect }: VoteCardProps) {
  const { votes: votesPersonality, missions: missionPersonality } = useSheetPersonalities();
  const total = getVoteTotal(vote);
  const winner = vote.options.find((option) => option._id === vote.confirmedWinningOptionId);
  const isClosed = vote.effectiveStatus !== "active";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center gap-2">
        {vote.effectiveStatus === "active" ? (
          <span className="inline-flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: votesPersonality.color, boxShadow: `0 0 0 3px ${votesPersonality.color}33` }}
            />
            <span
              className="font-[var(--font-display)] text-[9px] font-extrabold uppercase tracking-[0.14em]"
              style={{ color: votesPersonality.color }}
            >
              Open
            </span>
          </span>
        ) : (
          <span className="font-[var(--font-display)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]">
            {vote.effectiveStatus}
          </span>
        )}
        <span className="font-[var(--font-mono)] text-[10px] font-bold text-[var(--ink-3)]">
          {voteCode(vote._id)}
        </span>
        <span className="ml-auto text-[11px] text-[var(--ink-3)]">
          {showTallies ? `${total} ${total === 1 ? "vote" : "votes"}` : "Results hidden"}
        </span>
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2">
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ink-on-brand)]"
            style={{ background: votesPersonality.color }}
            aria-hidden="true"
          >
            <CheckSquare className="h-4 w-4" />
          </span>
          <span className="font-[var(--font-display)] text-sm font-extrabold leading-snug text-[var(--ink-1)]">
            {vote.title}
          </span>
        </span>
      </div>

      {showTallies && vote.options.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {vote.options.slice(0, 3).map((option) => {
            const count = vote.optionVoteCounts?.[option._id] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div
                key={option._id}
                className="relative overflow-hidden rounded-lg bg-[var(--meter-track)] px-2.5 py-2"
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${pct}%`, background: `color-mix(in oklab, ${votesPersonality.color} 18%, transparent)` }}
                />
                <div className="relative flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--ink-1)]">{option.title}</span>
                    {option.locationLabel ? (
                      <span className="block truncate text-[10px] text-[var(--ink-3)]">{option.locationLabel}</span>
                    ) : null}
                  </span>
                  <span className="font-[var(--font-mono)] text-xs font-bold" style={{ color: votesPersonality.color }}>
                    {count}/{total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {isClosed && winner ? (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-[var(--ink-1)]"
          style={{ background: votesPersonality.bg }}
        >
          Winner: <strong>{winner.title}</strong>
          {vote.resultingMissionId ? (
            <span
              className="ml-auto rounded px-1.5 py-0.5 font-[var(--font-mono)] text-[9px] font-extrabold uppercase tracking-[0.1em]"
              style={{
                color: missionPersonality.color,
                background: `color-mix(in oklab, ${missionPersonality.color} 16%, transparent)`,
              }}
            >
              Mission
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {formatTimeRemaining(vote.expiresAt)} · {vote.options.length} options
      </div>
      {"mySubmission" in vote && vote.mySubmission ? (
        <div className="mt-1 text-xs italic text-[var(--ink-3)]">You voted</div>
      ) : null}
    </button>
  );
}

type FollowerVoteDetailProps = {
  token: string;
  vote: VisibleRouteVote;
  onBack: () => void;
  onOptionFocus: (lat: number, lon: number) => void;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
};

function FollowerVoteDetail({
  token,
  vote,
  onBack,
  onOptionFocus,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
}: FollowerVoteDetailProps) {
  const submitVote = useMutation(tripcastApi.routeVotes.submitRouteVote);
  const markSeen = useMutation(tripcastApi.routeVotes.markRouteVoteSeen);
  const music = useMusicSafe();
  const log = useDebugLogger("RouteVotePanel", "src/features/routevote/RouteVotePanel.tsx");
  const { votes: votesPersonality } = useSheetPersonalities();

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

    onRequestFitMap(bounds);
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
      log.error("submit:error", "mutation", { message: e instanceof Error ? e.message : String(e) });
      setError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const total = vote.totalSubmissions ?? 0;
  const hintClass = "text-xs text-[var(--ink-3)]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-[var(--ink-3)] hover:text-[var(--ink-1)]">
          ← Back
        </button>
        <StatusBadge status={vote.effectiveStatus} />
        <span className="ml-auto text-xs text-[var(--ink-3)]">{formatTimeRemaining(vote.expiresAt)}</span>
      </div>

      <DialogueBox title={vote.title}>
        {vote.description && (
          <p className="mb-3 text-sm text-[var(--ink-3)]">{vote.description}</p>
        )}
        <ChoiceList>
          {vote.options.map((option, i) => {
            const selected = selectedOptionIds.has(option._id);
            const count = vote.optionVoteCounts?.[option._id] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const hasCoords = option.lat !== undefined && option.lon !== undefined;
            return (
              <div key={option._id} className="flex flex-col gap-1">
                <ChoiceItem
                  index={i + 1}
                  selected={selected}
                  onClick={() => {
                    toggleOption(option._id);
                    if (hasCoords && option.lat !== undefined && option.lon !== undefined) {
                      onOptionFocus(option.lat, option.lon);
                    }
                  }}
                  disabled={vote.effectiveStatus !== "active"}
                >
                  <span className="flex items-start gap-2">
                    <OptionCheckbox checked={selected} />
                    <span className="min-w-0">
                      <span className="font-medium">{option.title}</span>
                      {option.locationLabel && (
                        <span className={cn("block", hintClass)}>{option.locationLabel}</span>
                      )}
                      {option.description && (
                        <span className={cn("block", hintClass)}>{option.description}</span>
                      )}
                      {option.estimatedCostUsd !== undefined && (
                        <span className={cn("block", hintClass)}>${option.estimatedCostUsd.toFixed(2)}</span>
                      )}
                    </span>
                  </span>
                </ChoiceItem>
                {vote.optionVoteCounts !== undefined && (
                  <div className="pl-8 pr-3 flex items-center gap-2">
                    <StatBar value={pct} className="flex-1" />
                    <span className="w-12 text-right text-xs text-[var(--ink-3)]">
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
            placeholder="Add a comment... (optional)"
            className="bg-[var(--bg-card)] border-[var(--line-soft)] text-[var(--ink-1)] placeholder:text-[var(--ink-3)]"
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
              <input
                type="checkbox"
                checked={commentVisibility === "traveler_only"}
                onChange={(e) => setCommentVisibility(e.target.checked ? "traveler_only" : "public")}
              />
              Private (traveler only)
            </label>
            {commentVisibility === "public" && (
              <label className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
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
            <Button
              size="sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="border-0 text-[var(--ink-on-brand)]"
              style={{ background: votesPersonality.color }}
            >
              {isSubmitting ? "Submitting..." : vote.mySubmission ? "Update Vote" : "Submit Vote"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-xs text-[var(--ink-danger)]">
              {error}
            </p>
          )}
        </div>
      )}

      {vote.visibleComments.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">Comments</span>
          {vote.visibleComments.map((c) => (
            <div key={c.submissionId} className="flex flex-col gap-0.5 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-1)]">
              <span className="text-xs text-[var(--ink-3)]">{c.author}</span>
              <span>{c.comment}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TravelerVoteDetail({
  token,
  vote,
  onBack,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
  onRequestOpenMissionDetail,
}: {
  token: string;
  vote: RouteVoteListItem;
  onBack: () => void;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
  onRequestOpenMissionDetail?: (missionId: string) => void;
}) {
  const detail = useQuery(tripcastApi.routeVotes.travelerGetRouteVoteDetail, {
    token,
    routeVoteId: vote._id,
  });
  const overlay = useQuery(tripcastApi.routeVotes.getRouteVoteMapOverlay, {
    token,
    routeVoteId: vote._id,
  });

  const confirmWinner = useMutation(tripcastApi.routeVotes.travelerConfirmRouteVoteWinner);
  const hideComment = useMutation(tripcastApi.routeVotes.travelerHideRouteVoteComment);
  const closeVote = useMutation(tripcastApi.routeVotes.travelerCloseRouteVote);
  const cancelVote = useMutation(tripcastApi.routeVotes.travelerCancelRouteVote);
  const archiveVote = useMutation(tripcastApi.routeVotes.travelerArchiveRouteVote);
  const music = useMusicSafe();

  const [confirmingOptionId, setConfirmingOptionId] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

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
    onRequestFitMap(bounds);

    return () => {
      onVoteOverlayChange(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, fallbackOrigin, vote.options]);

  useEffect(() => {
    if (detail === null) {
      onVoteOverlayChange(null);
      onRequestFitMap(null);
    }
  }, [detail, onRequestFitMap, onVoteOverlayChange]);

  async function runVoteAction(action: () => Promise<unknown>) {
    setIsActing(true);
    try {
      await action();
      music.sfx("success");
    } finally {
      setIsActing(false);
    }
  }

  if (detail === undefined) {
    return <PendingNotice label="Loading vote..." />;
  }

  if (detail === null) {
    return (
      <div className="flex flex-col gap-3 py-4 text-center">
        <p className="text-sm text-[var(--ink-3)]">
          This route vote was deleted.
        </p>
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to votes
        </Button>
      </div>
    );
  }

  const total = detail.totalSubmissions;
  const canConfirmWinner =
    detail.effectiveStatus === "closed" && !detail.confirmedWinningOptionId;
  const canCancel = detail.effectiveStatus === "active" || detail.effectiveStatus === "closed";
  const canArchive = detail.effectiveStatus === "resolved" || detail.effectiveStatus === "cancelled";

  async function handleConfirmWinner(
    optionId: string,
    linkedMissionAction?: LinkedMissionAction,
  ) {
    await runVoteAction(async () => {
      await confirmWinner({
        token,
        routeVoteId: vote._id,
        winningOptionId: optionId,
        linkedMissionAction,
      });
      setConfirmingOptionId(null);
    });
  }

  async function handleHideComment(submissionId: string) {
    await hideComment({ token, submissionId }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-[var(--ink-3)] hover:text-[var(--ink-1)]">
          ← Back
        </button>
        <StatusBadge status={detail.effectiveStatus} />
        <span className="ml-auto text-xs text-[var(--ink-3)]">{formatTimeRemaining(detail.expiresAt)}</span>
      </div>

      {(detail.effectiveStatus === "active" || canCancel || canArchive) && (
        <div className="flex flex-wrap gap-2">
          {detail.effectiveStatus === "active" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={() => runVoteAction(() => closeVote({ token, routeVoteId: vote._id }))}
            >
              Close voting
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={() => runVoteAction(() => cancelVote({ token, routeVoteId: vote._id }))}
            >
              Cancel
            </Button>
          ) : null}
          {canArchive ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isActing}
              onClick={() => runVoteAction(() => archiveVote({ token, routeVoteId: vote._id }))}
            >
              Archive
            </Button>
          ) : null}
        </div>
      )}

      <DialogueBox title={detail.title}>
        {detail.description && (
          <p className="mb-3 text-sm text-[var(--ink-3)]">{detail.description}</p>
        )}
        <div className="flex flex-col gap-3">
          {detail.options.map((option) => {
            const count = detail.optionVoteCounts[option._id] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const isWinner = option._id === detail.confirmedWinningOptionId;
            const isSuggested =
              option._id === detail.suggestedWinnerId && !detail.confirmedWinningOptionId;

            return (
              <div
                key={option._id}
                className={cn(
                  "rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-2 text-[var(--ink-1)]",
                  isWinner && "border-[var(--flag)] bg-[var(--meter-track)]",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="font-medium text-sm">{option.title}</span>
                    {option.locationLabel && (
                      <span className="block text-xs text-[var(--ink-3)]">{option.locationLabel}</span>
                    )}
                    {option.description && (
                      <div className="flex items-center gap-1 text-xs text-[var(--ink-3)]">
                        <span className="line-clamp-1 flex-1">{option.description}</span>
                        {option.description.length > 60 && (
                          <InfoTooltip label={option.description}>
                            {option.description}
                          </InfoTooltip>
                        )}
                      </div>
                    )}
                    {isSuggested && !detail.isTied && (
                      <span className="text-xs text-[var(--ink-3)]">(suggested {TERMS.winningOption.toLowerCase()})</span>
                    )}
                    {isWinner && <span className="text-xs font-medium">{TERMS.winningOption}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-[var(--ink-3)]">
                    {count} / {total}
                  </span>
                </div>
                <StatBar value={pct} />
                {option.linkedMissionId && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[var(--ink-1)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                    Linked mission
                  </span>
                )}
                {canConfirmWinner &&
                  (confirmingOptionId === option._id ? (
                    option.linkedMissionId ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <span className="text-xs text-[var(--ink-3)]">
                          This option is linked to an existing mission. On confirm:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={isActing} onClick={() => handleConfirmWinner(option._id, "planned")}>
                            Mark planned
                          </Button>
                          <Button size="sm" disabled={isActing} onClick={() => handleConfirmWinner(option._id, "visible")}>
                            Mark visible
                          </Button>
                          <Button size="sm" variant="outline" disabled={isActing} onClick={() => handleConfirmWinner(option._id, "leave")}>
                            Leave unchanged
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmingOptionId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => handleConfirmWinner(option._id)} disabled={isActing}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmingOptionId(null)}>
                          Cancel
                        </Button>
                      </div>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setConfirmingOptionId(option._id)}
                    >
                      Set as {TERMS.winningOption.toLowerCase()}
                    </Button>
                  ))}
              </div>
            );
          })}
          {detail.isTied && !detail.confirmedWinningOptionId && (
            <p className="text-xs text-[var(--ink-3)]">Tied - choose a winner manually.</p>
          )}
        </div>
      </DialogueBox>

      {detail.mission && (
        <DialogueBox title="Mission Created">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--ink-1)] line-clamp-1">
                {detail.mission.title}
              </p>
              <StatusBadge status={detail.mission.status} />
            </div>
            {detail.mission.locationLabel && (
              <p className="text-xs text-[var(--ink-3)]">{detail.mission.locationLabel}</p>
            )}
            <p className="text-xs text-[var(--ink-3)]">
              Open Missions to view and edit.
            </p>
            {onRequestOpenMissionDetail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRequestOpenMissionDetail(detail.mission!._id)}
              >
                View Mission
              </Button>
            )}
          </div>
        </DialogueBox>
      )}

      {detail.submissions.some((s) => s.comment) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">
            All Comments
          </span>
          {detail.submissions
            .filter((s) => s.comment)
            .map((sub) => (
              <div
                key={sub._id}
                className="border border-[var(--line-soft)] rounded-md px-3 py-2 bg-[var(--bg-card)] text-[var(--ink-1)] text-sm flex items-start justify-between gap-2"
              >
                <div>
                  <span>{sub.comment}</span>
                  {sub.commentVisibility === "traveler_only" && (
                    <span className="ml-2 text-xs text-[var(--ink-3)]">(private)</span>
                  )}
                  {sub.publicCommentHidden && (
                    <span className="ml-2 text-xs text-[var(--ink-3)]">(hidden)</span>
                  )}
                </div>
                {!sub.publicCommentHidden && sub.commentVisibility === "public" && (
                  <button
                    type="button"
                    onClick={() => handleHideComment(sub._id)}
                    className="shrink-0 text-xs text-[var(--ink-3)] hover:text-[var(--ink-danger)]"
                  >
                    Hide
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function RouteVotePanel({
  token,
  open,
  role = "follower",
  onClose,
  onRequestCoordinatePick,
  referenceLocation = null,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
  isPickingCoordinate,
  pendingOpenVoteId,
  onClearPendingVoteId,
  onRequestOpenMissionDetail,
  debugSource,
}: RouteVotePanelProps) {
  const isTraveler = role === "traveler";
  const { votes: votesPersonality } = useSheetPersonalities();
  const followerVotes = useQuery(
    tripcastApi.routeVotes.listVisibleRouteVotes,
    open && !isTraveler ? { token } : "skip",
  );
  const travelerVotes = useQuery(
    tripcastApi.routeVotes.travelerListRouteVotes,
    open && isTraveler ? { token } : "skip",
  );
  const votes = (isTraveler ? travelerVotes : followerVotes) as PanelVote[] | undefined;
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [statusFilter, setStatusFilter] = useState<VoteStatusFilter>("all");
  const music = useMusicSafe();
  const log = useDebugLogger("RouteVotePanel", "src/features/routevote/RouteVotePanel.tsx");
  const calibration = useCenteringCalibration();

  // Resolve the selected vote by id when it isn't in the (capped) list — keeps
  // navigation scale-independent so detail opens regardless of list size.
  const listVote = votes?.find((v) => v._id === selectedVoteId) ?? null;
  const needByIdFetch = Boolean(selectedVoteId) && listVote === null;
  const followerByIdVote = useQuery(
    tripcastApi.routeVotes.getVisibleRouteVote,
    needByIdFetch && !isTraveler && selectedVoteId
      ? { token, routeVoteId: selectedVoteId }
      : "skip",
  );
  const travelerByIdVote = useQuery(
    tripcastApi.routeVotes.travelerGetRouteVoteDetail,
    needByIdFetch && isTraveler && selectedVoteId
      ? { token, routeVoteId: selectedVoteId }
      : "skip",
  );
  const byIdVote = (isTraveler ? travelerByIdVote : followerByIdVote) as
    | PanelVote
    | null
    | undefined;
  const selectedVote = listVote ?? byIdVote ?? null;
  const detailLoading =
    view === "detail" && !selectedVote && needByIdFetch && byIdVote === undefined;
  const openCount = votes?.filter((vote) => vote.effectiveStatus === "active").length ?? 0;
  const closedCount = votes?.filter((vote) => vote.effectiveStatus !== "active").length ?? 0;
  const filteredVotes =
    votes?.filter((vote) => matchesVoteStatusFilter(vote.effectiveStatus, statusFilter)) ?? votes;

  useActiveUiContext(open, {
    sheetName: "RouteVotePanel",
    label: TERMS.votes,
    view: isPickingCoordinate ? `${view}:coordinate-pick` : view,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/routevote/RouteVotePanel.tsx",
  }, { boundsSelector: "[data-role='route-votes-sheet']" });

  useEffect(() => {
    if (!pendingOpenVoteId) return;
    log.logUi("action:pending-vote:navigate", { voteId: pendingOpenVoteId, role });
    setSelectedVoteId(pendingOpenVoteId);
    setView("detail");
    onClearPendingVoteId?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenVoteId]);

  useEffect(() => {
    if (view === "detail" && needByIdFetch && byIdVote === null) {
      log.logUi("action:pending-vote:not-found", { voteId: selectedVoteId, role });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, needByIdFetch, byIdVote]);

  function handleBack() {
    log.logInteraction("view:change", { from: view, to: "list" });
    music.sfx("page");
    setSelectedVoteId(null);
    setView("list");
    onVoteOverlayChange(null);
    onRequestFitMap(null);
  }

  function handleOptionFocus(lat: number, lon: number) {
    onRequestFitMap([[lon - 0.01, lat - 0.01], [lon + 0.01, lat + 0.01]]);
  }

  const showBack = view === "create" || Boolean(selectedVote);
  const headerTitle = view === "create"
    ? `New ${TERMS.routeVote}`
    : selectedVote
      ? selectedVote.title
      : "Route Votes";

  return (
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal={isPickingCoordinate || calibration}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPickingCoordinate) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className={cn(
          // Capped so the map keeps a visible band above the sheet for focus centering.
          "z-[10] max-h-[62dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
          isPickingCoordinate && "invisible pointer-events-none",
        )}
        data-role="route-votes-sheet"
        style={{ paddingBottom: "calc(100px + env(safe-area-inset-bottom))" }}
      >
        <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: votesPersonality.color }} />
        <div
          className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
          style={{ background: `linear-gradient(180deg, ${votesPersonality.bg} 0%, var(--bg-paper) 100%)` }}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {showBack ? (
              <SheetBackButton aria-label="Back to votes list" onClick={handleBack} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
                  style={{ background: votesPersonality.color }}
                >
                  <CheckSquare className="h-4 w-4" />
                </span>
                <SheetTitle className="truncate font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                  {headerTitle}
                </SheetTitle>
              </div>
              {view === "list" && votes ? (
                <p className="text-xs text-[var(--ink-3)]">
                  {openCount} open · {closedCount} closed
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === "list" && votes ? (
              <FilterButton
                options={VOTE_FILTER_OPTIONS}
                value={statusFilter}
                defaultValue="all"
                onChange={(v) => {
                  log.logInteraction("filter:change", { from: statusFilter, to: v });
                  setStatusFilter(v);
                }}
              />
            ) : null}
            <SheetCloseButton aria-label={`Close ${TERMS.votes.toLowerCase()} panel`} />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 pb-4 pt-3">
          <AnimatePresence mode="wait">
            {view === "create" && isTraveler && onRequestCoordinatePick ? (
              <motion.div
                key="create"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <CreateRouteVoteForm
                  token={token}
                  onCreated={(id) => {
                    music.sfx("success");
                    log.logInteraction("view:change", { from: "create", to: "detail", voteId: id });
                    setSelectedVoteId(id);
                    setView("detail");
                  }}
                  onCancel={handleBack}
                  onRequestCoordinatePick={onRequestCoordinatePick}
                  referenceLocation={referenceLocation}
                />
              </motion.div>
            ) : view === "detail" && selectedVote ? (
              <motion.div
                key={selectedVote._id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {isTraveler ? (
                  <TravelerVoteDetail
                    token={token}
                    vote={selectedVote as RouteVoteListItem}
                    onBack={handleBack}
                    onVoteOverlayChange={onVoteOverlayChange}
                    onRequestFitMap={onRequestFitMap}
                    fallbackOrigin={fallbackOrigin}
                    onRequestOpenMissionDetail={onRequestOpenMissionDetail}
                  />
                ) : (
                  <FollowerVoteDetail
                    token={token}
                    vote={selectedVote as VisibleRouteVote}
                    onBack={handleBack}
                    onOptionFocus={handleOptionFocus}
                    onVoteOverlayChange={onVoteOverlayChange}
                    onRequestFitMap={onRequestFitMap}
                    fallbackOrigin={fallbackOrigin}
                  />
                )}
              </motion.div>
            ) : detailLoading ? (
              <motion.div
                key="detail-loading"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <PendingNotice
                  label="Loading vote..."
                  className="py-6 text-center text-sm text-[var(--ink-3)]"
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
                {isTraveler && onRequestCoordinatePick ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      music.sfx("page");
                      log.logInteraction("view:change", { from: view, to: "create" });
                      setView("create");
                    }}
                    className="w-full border-0 text-[var(--ink-on-brand)]"
                    style={{ background: votesPersonality.color }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Propose new route
                  </Button>
                ) : null}
                {votes === undefined ? (
                  <PendingNotice
                    label="Loading votes..."
                    className="py-6 text-center text-sm text-[var(--ink-3)]"
                  />
                ) : votes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--ink-3)]">
                    No votes yet.
                  </p>
                ) : (filteredVotes ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--ink-3)]">
                    No {statusFilter} votes.
                  </p>
                ) : (
                  (filteredVotes ?? []).map((vote) => (
                    <VoteCard
                      key={vote._id}
                      vote={vote}
                      showTallies={isTraveler || vote.optionVoteCounts !== undefined}
                      onSelect={() => {
                        log.logInteraction("view:change", { from: "list", to: "detail", voteId: vote._id });
                        music.sfx("page");
                        setSelectedVoteId(vote._id);
                        setView("detail");
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
