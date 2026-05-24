import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, Plus } from "lucide-react";
import {
  tripcastApi,
  type RouteVoteMapOverlay,
  type RouteVoteListItem,
} from "../../convex/tripcastApi";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { StatBar } from "../../components/rpg/StatBar";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import {
  formatTimeRemaining,
  getRouteVoteMapBounds,
  matchesVoteStatusFilter,
  VOTE_FILTER_OPTIONS,
  type VoteStatusFilter,
} from "../../lib/routeVoteUtils";
import { FilterButton } from "../../components/ui/FilterButton";
import CreateRouteVoteForm from "./CreateRouteVoteForm";
import { PendingNotice } from "../../components/resilience/PendingNotice";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { InfoTooltip } from "../../components/ui/info-tooltip";
import { TERMS } from "../../copy/terminology";
import { useSheetPersonalities } from "../redesign/sheetPersonality";

type RouteVoteProgressProps = {
  token: string;
  /** Controls visibility. Kept mounted while closed so the close transition plays. */
  open: boolean;
  onClose: () => void;
  onRequestCoordinatePick: (
    optionIndex: number,
    callback: (coord: { lat: number; lon: number }) => void,
  ) => void;
  referenceLocation: { lat: number; lon: number } | null;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null, paddingBottom?: number) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
  isPickingCoordinate?: boolean;
  pendingOpenVoteId?: string | null;
  onClearPendingVoteId?: () => void;
  onRequestOpenMissionDetail?: (missionId: string) => void;
  debugSource?: { source: string; sourceLabel: string };
};

type View = "list" | "create" | "detail";

function VoteListCard({
  vote,
  onViewDetail,
  onCancel,
  onArchive,
  isActing,
}: {
  vote: RouteVoteListItem;
  onViewDetail: () => void;
  onCancel: () => void;
  onArchive: () => void;
  isActing: boolean;
}) {
  const { votes: votesPersonality } = useSheetPersonalities();
  const status = vote.effectiveStatus;
  const total = vote.totalSubmissions;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onViewDetail} className="flex min-w-0 items-start gap-2 text-left">
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
            style={{ background: votesPersonality.color }}
            aria-hidden="true"
          >
            <CheckSquare className="h-4 w-4" />
          </span>
          <span className="font-[var(--font-display)] text-sm font-extrabold leading-snug text-[var(--ink-1)]">
            {vote.title}
          </span>
        </button>
        <StatusBadge status={status} />
      </div>
      <div className="text-xs text-muted-foreground">
        {formatTimeRemaining(vote.expiresAt)} · {total} {total === 1 ? "vote" : "votes"} · {vote.options.length} options
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={onViewDetail}
          disabled={isActing}
          className="border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]"
        >
          Details
        </Button>
        {(status === "active" || status === "closed") && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={isActing}
            className="border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]"
          >
            Cancel
          </Button>
        )}
        {(status === "resolved" || status === "cancelled") && (
          <Button
            size="sm"
            variant="outline"
            onClick={onArchive}
            disabled={isActing}
            className="border-[var(--line-soft)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]"
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}

function VoteDetailView({
  token,
  vote,
  onBack,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
  onRequestOpenMissionDetail,
  onCloseVote,
}: {
  token: string;
  vote: RouteVoteListItem;
  onBack: () => void;
  onVoteOverlayChange: (
    overlay: RouteVoteMapOverlay | null,
    optionNumberById?: Record<string, number> | null,
  ) => void;
  onRequestFitMap: (bounds: [[number, number], [number, number]] | null, paddingBottom?: number) => void;
  fallbackOrigin: { lat: number; lon: number } | null;
  onRequestOpenMissionDetail?: (missionId: string) => void;
  onCloseVote: () => Promise<void>;
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
    onRequestFitMap(bounds, 120);

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

  if (detail === undefined) {
    return <PendingNotice label="Loading vote..." />;
  }

  if (detail === null) {
    return (
      <div className="flex flex-col gap-3 py-4 text-center">
        <p className="text-sm text-muted-foreground">
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

  async function handleConfirmWinner(
    optionId: string,
    linkedMissionAction?: "planned" | "visible" | "leave",
  ) {
    setIsActing(true);
    try {
      await confirmWinner({
        token,
        routeVoteId: vote._id,
        winningOptionId: optionId,
        linkedMissionAction,
      });
      music.sfx("success");
      setConfirmingOptionId(null);
    } finally {
      setIsActing(false);
    }
  }

  async function handleHideComment(submissionId: string) {
    await hideComment({ token, submissionId }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <StatusBadge status={detail.effectiveStatus} />
      </div>

      {detail.effectiveStatus === "active" && (
        <Button size="sm" variant="outline" disabled={isActing} onClick={onCloseVote} className="w-fit">
          Close voting
        </Button>
      )}

      <DialogueBox title={detail.title}>
        {detail.description && (
          <p className="text-sm text-muted-foreground mb-3">{detail.description}</p>
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
                className={`rounded-md border p-2 ${isWinner ? "border-primary bg-accent" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="font-medium text-sm">{option.title}</span>
                    {option.locationLabel && (
                      <span className="block text-xs text-muted-foreground">{option.locationLabel}</span>
                    )}
                    {option.description && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="line-clamp-1 flex-1">{option.description}</span>
                        {option.description.length > 60 && (
                          <InfoTooltip label={option.description}>
                            {option.description}
                          </InfoTooltip>
                        )}
                      </div>
                    )}
                    {isSuggested && !detail.isTied && (
                      <span className="text-xs text-muted-foreground">(suggested {TERMS.winningOption.toLowerCase()})</span>
                    )}
                    {isWinner && <span className="text-xs font-medium">{TERMS.winningOption}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
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
                        <span className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">Tied — choose a winner manually.</p>
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
              <p className="text-xs text-muted-foreground">{detail.mission.locationLabel}</p>
            )}
            <p className="text-xs text-muted-foreground">
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
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                    <span className="ml-2 text-xs text-muted-foreground">(private)</span>
                  )}
                  {sub.publicCommentHidden && (
                    <span className="ml-2 text-xs text-muted-foreground">(hidden)</span>
                  )}
                </div>
                {!sub.publicCommentHidden && sub.commentVisibility === "public" && (
                  <button
                    type="button"
                    onClick={() => handleHideComment(sub._id)}
                    className="text-xs text-muted-foreground hover:text-destructive shrink-0"
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

export default function RouteVoteProgress({
  token,
  open,
  onClose,
  onRequestCoordinatePick,
  referenceLocation,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
  isPickingCoordinate,
  pendingOpenVoteId,
  onClearPendingVoteId,
  onRequestOpenMissionDetail,
  debugSource,
}: RouteVoteProgressProps) {
  const { votes: votesPersonality } = useSheetPersonalities();
  const votes = useQuery(
    tripcastApi.routeVotes.travelerListRouteVotes,
    open ? { token } : "skip",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const log = useDebugLogger("RouteVoteProgress", "src/features/routevote/RouteVoteProgress.tsx");

  const closeVote = useMutation(tripcastApi.routeVotes.travelerCloseRouteVote);
  const cancelVote = useMutation(tripcastApi.routeVotes.travelerCancelRouteVote);
  const archiveVote = useMutation(tripcastApi.routeVotes.travelerArchiveRouteVote);

  const [view, setView] = useState<View>("list");
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [actingVoteId, setActingVoteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VoteStatusFilter>("all");
  const filteredVotes =
    votes?.filter((vote) => matchesVoteStatusFilter(vote.effectiveStatus, statusFilter)) ?? votes;
  const music = useMusicSafe();
  useActiveUiContext(open, {
    sheetName: "RouteVoteProgress",
    label: TERMS.votes,
    view: isPickingCoordinate ? `${view}:coordinate-pick` : view,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/routevote/RouteVoteProgress.tsx",
  }, { boundsSelector: "[data-role='route-votes-sheet']" });

  useEffect(() => {
    const id = setTimeout(() => {
      const h = containerRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) log.logInteraction("sheet:size", { heightPx: Math.round(h), viewportPx: window.innerHeight });
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    log.logInteraction("coordinate:pick-mode:active", { isPickingCoordinate: !!isPickingCoordinate });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPickingCoordinate]);

  // When parent requests navigation to a specific vote, jump to its detail view.
  useEffect(() => {
    if (!pendingOpenVoteId || !votes) return;
    const target = votes.find((v) => v._id === pendingOpenVoteId);
    if (target) {
      log.logUi("action:pending-vote:navigate", { voteId: pendingOpenVoteId });
      setSelectedVoteId(pendingOpenVoteId);
      setView("detail");
      onClearPendingVoteId?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenVoteId, votes]);

  const selectedVote = votes?.find((v) => v._id === selectedVoteId) ?? null;

  async function handleCloseVote(voteId: string) {
    setActingVoteId(voteId);
    try {
      await closeVote({ token, routeVoteId: voteId });
      music.sfx("success");
    } finally {
      setActingVoteId(null);
    }
  }

  async function handleCancelVote(voteId: string) {
    setActingVoteId(voteId);
    try {
      await cancelVote({ token, routeVoteId: voteId });
      music.sfx("success");
    } finally {
      setActingVoteId(null);
    }
  }

  async function handleArchiveVote(voteId: string) {
    setActingVoteId(voteId);
    try {
      await archiveVote({ token, routeVoteId: voteId });
      music.sfx("success");
    } finally {
      setActingVoteId(null);
    }
  }

  return (
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal={isPickingCoordinate}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPickingCoordinate) {
          log.logInteraction("sheet:close", { trigger: "backdrop" });
          onClose();
        }
      }}
    >
      <SheetContent
        ref={containerRef}
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className={cn(
          "z-[10] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
          isPickingCoordinate && "invisible pointer-events-none",
        )}
        data-role="route-votes-sheet"
      >
        <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: votesPersonality.color }} />
        <div
          className="sticky top-0 z-[1] flex shrink-0 items-center justify-between border-b border-[var(--line-soft)] px-4 py-3"
          style={{ background: `linear-gradient(180deg, ${votesPersonality.bg} 0%, var(--bg-paper) 100%)` }}
        >
          <div className="flex items-center gap-2">
            {(view === "create" || view === "detail") && (
              <button
                type="button"
                onClick={() => {
                  music.sfx("page");
                  setView("list");
                  setSelectedVoteId(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ←
              </button>
            )}
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-sm"
                  style={{ background: votesPersonality.color }}
                >
                  <CheckSquare className="h-4 w-4" />
                </span>
                <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                  {view === "create"
                    ? `New ${TERMS.routeVote}`
                    : view === "detail"
                      ? `${TERMS.routeVote} Details`
                      : TERMS.votes}
                </SheetTitle>
              </div>
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
            <SheetCloseButton aria-label="Close route votes" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {view === "create" ? (
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
                onCancel={() => {
                  music.sfx("page");
                  log.logInteraction("view:change", { from: "create", to: "list" });
                  setView("list");
                }}
                onRequestCoordinatePick={onRequestCoordinatePick}
                referenceLocation={referenceLocation}
              />
            </motion.div>
          ) : view === "detail" && selectedVote ? (
            <motion.div
              key="detail"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <VoteDetailView
                token={token}
                vote={selectedVote}
                onBack={() => {
                  music.sfx("page");
                  setView("list");
                  setSelectedVoteId(null);
                  onVoteOverlayChange(null);
                  onRequestFitMap(null);
                }}
                onVoteOverlayChange={onVoteOverlayChange}
                onRequestFitMap={onRequestFitMap}
                fallbackOrigin={fallbackOrigin}
                onRequestOpenMissionDetail={onRequestOpenMissionDetail}
                onCloseVote={() => handleCloseVote(selectedVote._id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-3"
            >
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
              {votes === undefined ? (
                <PendingNotice label="Loading votes..." />
              ) : votes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active votes.</p>
              ) : (filteredVotes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No {statusFilter} votes.</p>
              ) : (
                (filteredVotes ?? []).map((vote) => (
                  <VoteListCard
                    key={vote._id}
                    vote={vote}
                    onViewDetail={() => {
                      music.sfx("page");
                      setSelectedVoteId(vote._id);
                      setView("detail");
                    }}
                    onCancel={() => handleCancelVote(vote._id)}
                    onArchive={() => handleArchiveVote(vote._id)}
                    isActing={actingVoteId === vote._id}
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
