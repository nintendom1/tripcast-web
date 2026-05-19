import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  tripcastApi,
  type RouteVoteMapOverlay,
  type RouteVoteListItem,
  type ChallengeStatus,
} from "../../convex/tripcastApi";
import { cn } from "@/lib/utils";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetTitle,
} from "../../components/ui/sheet";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { StatBar } from "../../components/rpg/StatBar";
import { StatusBadge } from "../../components/rpg/StatusBadge";
import { formatTimeRemaining, getRouteVoteMapBounds } from "../../lib/routeVoteUtils";
import CreateRouteVoteForm from "./CreateRouteVoteForm";
import { PendingNotice } from "../../components/resilience/PendingNotice";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";

type RouteVoteProgressProps = {
  token: string;
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
};

type View = "list" | "create" | "detail";

const CHALLENGE_STATUSES: ChallengeStatus[] = ["planned", "in_progress", "completed", "dropped"];

function VoteListCard({
  vote,
  onViewDetail,
  onCloseVote,
  onCancel,
  onArchive,
  isActing,
}: {
  vote: RouteVoteListItem;
  onViewDetail: () => void;
  onCloseVote: () => void;
  onCancel: () => void;
  onArchive: () => void;
  isActing: boolean;
}) {
  const status = vote.effectiveStatus;
  const total = vote.totalSubmissions;

  return (
    <div className="rounded-md border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onViewDetail} className="font-medium text-sm text-left hover:underline">
          {vote.title}
        </button>
        <StatusBadge status={status} />
      </div>
      <div className="text-xs text-muted-foreground">
        {formatTimeRemaining(vote.expiresAt)} · {total} {total === 1 ? "vote" : "votes"} · {vote.options.length} options
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={onViewDetail} disabled={isActing}>
          Details
        </Button>
        {status === "active" && (
          <Button size="sm" variant="outline" onClick={onCloseVote} disabled={isActing}>
            Close voting
          </Button>
        )}
        {(status === "active" || status === "closed") && (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={isActing}>
            Cancel
          </Button>
        )}
        {(status === "resolved" || status === "cancelled") && (
          <Button size="sm" variant="outline" onClick={onArchive} disabled={isActing}>
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
  const updateChallengeStatus = useMutation(tripcastApi.routeVotes.travelerUpdateChallengeStatus);
  const music = useMusicSafe();

  const [confirmingOptionId, setConfirmingOptionId] = useState<string | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<ChallengeStatus | null>(null);
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

  async function handleConfirmWinner(optionId: string) {
    setIsActing(true);
    try {
      await confirmWinner({ token, routeVoteId: vote._id, winningOptionId: optionId });
      music.sfx("success");
      setConfirmingOptionId(null);
    } finally {
      setIsActing(false);
    }
  }

  async function handleHideComment(submissionId: string) {
    await hideComment({ token, submissionId }).catch(() => {});
  }

  async function handleChallengeStatusUpdate() {
    const d = detail;
    if (!d || !d.challenge || !challengeStatus) return;
    setIsActing(true);
    try {
      await updateChallengeStatus({
        token,
        challengeId: d.challenge._id,
        newStatus: challengeStatus,
      });
      music.sfx("success");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <StatusBadge status={detail.effectiveStatus} />
      </div>

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
                    {isSuggested && !detail.isTied && (
                      <span className="text-xs text-muted-foreground">(suggested winner)</span>
                    )}
                    {isWinner && <span className="text-xs font-medium">Winner</span>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {count} / {total}
                  </span>
                </div>
                <StatBar value={pct} />
                {canConfirmWinner &&
                  (confirmingOptionId === option._id ? (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => handleConfirmWinner(option._id)} disabled={isActing}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmingOptionId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setConfirmingOptionId(option._id)}
                    >
                      Set as winner
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

      {detail.challenge && (
        <DialogueBox title="Challenge">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{detail.challenge.title}</span>
              <StatusBadge status={detail.challenge.status} />
            </div>
            {detail.challenge.locationLabel && (
              <span className="text-xs text-muted-foreground">{detail.challenge.locationLabel}</span>
            )}
            <div className="flex items-center gap-2">
              <select
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                value={challengeStatus ?? detail.challenge.status}
                onChange={(e) => setChallengeStatus(e.target.value as ChallengeStatus)}
              >
                {CHALLENGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={handleChallengeStatusUpdate}
                disabled={
                  isActing ||
                  challengeStatus === null ||
                  challengeStatus === detail.challenge.status
                }
              >
                Update
              </Button>
            </div>
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
                className="border rounded-md px-3 py-2 text-sm flex items-start justify-between gap-2"
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
  onClose,
  onRequestCoordinatePick,
  referenceLocation,
  onVoteOverlayChange,
  onRequestFitMap,
  fallbackOrigin,
  isPickingCoordinate,
}: RouteVoteProgressProps) {
  const votes = useQuery(tripcastApi.routeVotes.travelerListRouteVotes, { token });
  const containerRef = useRef<HTMLDivElement>(null);
  const log = useDebugLogger("RouteVoteProgress", "src/features/routevote/RouteVoteProgress.tsx");

  const closeVote = useMutation(tripcastApi.routeVotes.travelerCloseRouteVote);
  const cancelVote = useMutation(tripcastApi.routeVotes.travelerCancelRouteVote);
  const archiveVote = useMutation(tripcastApi.routeVotes.travelerArchiveRouteVote);

  const [view, setView] = useState<View>("list");
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [actingVoteId, setActingVoteId] = useState<string | null>(null);
  const music = useMusicSafe();

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
      open
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
        className={cn(
          "z-[10] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
          isPickingCoordinate && "invisible pointer-events-none",
        )}
        data-role="route-votes-sheet"
      >
        <SheetGrabber />
        <div className="sticky top-0 z-[1] flex shrink-0 items-center justify-between border-b bg-[var(--bg-paper)] px-4 py-3">
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
            <SheetTitle className="text-sm font-semibold">
              {view === "create"
                ? "New Vote"
                : view === "detail"
                  ? "Vote Details"
                  : "Manage Votes"}
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close route votes" />
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
                className="w-full"
              >
                + Propose new route
              </Button>
              {votes === undefined ? (
                <PendingNotice label="Loading votes..." />
              ) : votes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active votes.</p>
              ) : (
                votes.map((vote) => (
                  <VoteListCard
                    key={vote._id}
                    vote={vote}
                    onViewDetail={() => {
                      music.sfx("page");
                      setSelectedVoteId(vote._id);
                      setView("detail");
                    }}
                    onCloseVote={() => handleCloseVote(vote._id)}
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
