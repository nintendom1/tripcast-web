import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Challenge, Role } from "../../convex/tripcastApi";
import ChallengeCard from "./ChallengeCard";
import ChallengeProposalForm from "./ChallengeProposalForm";
import ChallengeDetailSheet from "./ChallengeDetailSheet";
import {
  Sheet,
  SheetBackButton,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTab,
  SheetTabs,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { SwipeRow } from "../../components/ui/SwipeRow";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { PendingNotice } from "../../components/resilience/PendingNotice";
import { cn } from "@/lib/utils";
import { useMusicSafe } from "../../providers/MusicProvider";

type Props = {
  open: boolean;
  token: string;
  role: Role;
  sessionId?: string;
  userId?: string;
  onClose: () => void;
  onStartChallenge?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  isPickingCoordinate?: boolean;
  pendingOpenChallengeId?: string | null;
  onClearPendingChallenge?: () => void;
  onRequestNavigateToChallenge?: (coord: { lat: number; lon: number }) => void;
  onCompleteAsStory?: (challenge: Challenge) => void;
  /** When set + the panel is open, navigate straight to the matching mission's
   *  detail view rather than the list. Used by the Complete-as-Story → Back
   *  flow so dismissing the story form returns the Traveler to the mission's
   *  full action set. Parent clears via `onClearPendingDetail` once we land. */
  pendingOpenDetailChallengeId?: string | null;
  onClearPendingDetail?: () => void;
};

type ViewMode = "list" | "create" | "detail";

type TravelerFilter = "all" | "proposed" | "visible" | "in_progress" | "completed" | "dropped";

const TRAVELER_FILTERS: { value: TravelerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "proposed", label: "Proposed" },
  { value: "visible", label: "Visible" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const TITLE_BY_VIEW: Record<ViewMode, { traveler: string; crew: string }> = {
  list: { traveler: "Missions", crew: "Missions" },
  create: { traveler: "New mission", crew: "Propose mission" },
  detail: { traveler: "Mission", crew: "Mission" },
};

// ---------------------------------------------------------------------------
// Main panel — owns the internal list / create / detail nav stack
// ---------------------------------------------------------------------------

export default function ChallengePanel({
  open,
  token,
  role,
  userId,
  onClose,
  onStartChallenge,
  onRequestCoordinatePick,
  isPickingCoordinate,
  pendingOpenChallengeId,
  onClearPendingChallenge,
  onRequestNavigateToChallenge,
  onCompleteAsStory,
  pendingOpenDetailChallengeId,
  onClearPendingDetail,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Challenge | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const music = useMusicSafe();
  const deleteChallenge = useMutation(tripcastApi.challenges.travelerDeleteChallenge);

  async function handleConfirmDelete() {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteChallenge({ token, challengeId: pendingDelete._id });
      music.sfx("success");
      setPendingDelete(null);
    } catch {
      // Mutation already shows the user-friendly error inline via ChallengeDetailSheet
      // when they get there; here we just close the confirm and trust the data
      // subscription to either reflect the delete or keep the row.
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  // Reset view when panel closes — the next open should always land on the list
  useEffect(() => {
    if (!open) {
      setViewMode("list");
      setSelectedChallenge(null);
    }
  }, [open]);

  // Pin-driven navigation: the parent passes a challenge id to focus on; we
  // always return the panel to its list view (and trust the parent to recenter
  // the map) so the user can see the row highlight rather than the detail.
  useEffect(() => {
    if (!pendingOpenChallengeId) return;
    setViewMode("list");
    setSelectedChallenge(null);
  }, [pendingOpenChallengeId]);

  // Back-from-story navigation: the parent (TripMap) sets this when the
  // Traveler hits "← Back" inside AddCheckpointSheet's mission-completion
  // mode. We look up the challenge by id and drop the user straight back on
  // the same mission's detail view so the four-button action set is visible.
  const pendingDetailChallenge = useQuery(
    tripcastApi.challenges.getChallenge,
    pendingOpenDetailChallengeId && open
      ? { token, challengeId: pendingOpenDetailChallengeId }
      : "skip",
  );

  useEffect(() => {
    if (!open || !pendingOpenDetailChallengeId) return;
    if (pendingDetailChallenge === undefined) return; // still loading
    if (pendingDetailChallenge === null) {
      // Challenge was deleted while the user was writing the story — fall back
      // to the list view and clear the pending id so we don't loop.
      onClearPendingDetail?.();
      setViewMode("list");
      setSelectedChallenge(null);
      return;
    }
    setSelectedChallenge(pendingDetailChallenge);
    setViewMode("detail");
    onClearPendingDetail?.();
    // pendingDetailChallenge / onClearPendingDetail are stable enough for the
    // one-shot navigation behavior we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingOpenDetailChallengeId, pendingDetailChallenge]);

  // Entering the detail view auto-focuses the map on the mission's coordinates
  // — same UX as opening a story. The explicit "View on map" link in the
  // detail body remains useful for re-centering after the user has panned away.
  useEffect(() => {
    if (viewMode !== "detail" || !selectedChallenge) return;
    if (selectedChallenge.lat === undefined || selectedChallenge.lon === undefined) return;
    onRequestNavigateToChallenge?.({
      lat: selectedChallenge.lat,
      lon: selectedChallenge.lon,
    });
    // onRequestNavigateToChallenge is stable enough for our purposes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedChallenge?._id]);

  function goToList(sound: "page" | "success" | null = "page") {
    if (sound) music.sfx(sound);
    setViewMode("list");
    setSelectedChallenge(null);
  }

  function goToCreate() {
    music.sfx("page");
    setSelectedChallenge(null);
    setViewMode("create");
  }

  function goToDetail(challenge: Challenge) {
    music.sfx("page");
    setSelectedChallenge(challenge);
    setViewMode("detail");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isPickingCoordinate) {
      onClose();
    }
  }

  const isTraveler = role === "traveler";
  const headerTitle = isTraveler ? TITLE_BY_VIEW[viewMode].traveler : TITLE_BY_VIEW[viewMode].crew;
  const showBack = viewMode !== "list";

  return (
    <Sheet
      open={open}
      modal={false}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={isPickingCoordinate}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        className={cn(
          "z-[10] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
          isPickingCoordinate && "invisible pointer-events-none",
        )}
        data-role="missions-sheet"
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-4 pt-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {showBack ? (
              <SheetBackButton aria-label="Back to missions list" onClick={() => goToList()} />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <SheetKicker dotColor="var(--plum)">Missions</SheetKicker>
              <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                {headerTitle}
              </SheetTitle>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === "list" ? (
              <Button
                size="sm"
                type="button"
                onClick={goToCreate}
                aria-label={isTraveler ? "Create mission" : "Propose mission"}
                className="rounded-full"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {isTraveler ? "New" : "Propose"}
              </Button>
            ) : null}
            <SheetCloseButton aria-label="Close challenges panel" />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col">
          {viewMode === "list" ? (
            isTraveler ? (
              <TravelerListView
                token={token}
                pendingOpenChallengeId={pendingOpenChallengeId}
                onClearPendingChallenge={onClearPendingChallenge}
                onRequestNavigateToChallenge={onRequestNavigateToChallenge}
                onOpenDetail={goToDetail}
                onRequestDelete={(c) => setPendingDelete(c)}
              />
            ) : (
              <CrewListView
                token={token}
                userId={userId}
                pendingOpenChallengeId={pendingOpenChallengeId}
                onClearPendingChallenge={onClearPendingChallenge}
                onRequestNavigateToChallenge={onRequestNavigateToChallenge}
                onOpenDetail={goToDetail}
              />
            )
          ) : viewMode === "create" ? (
            <div className="overflow-y-auto px-4 py-3">
              {isTraveler ? (
                <TravelerCreateForm
                  token={token}
                  onRequestCoordinatePick={onRequestCoordinatePick}
                  onSuccess={() => goToList("success")}
                />
              ) : (
                <ChallengeProposalForm
                  token={token}
                  onRequestCoordinatePick={onRequestCoordinatePick}
                  onSuccess={() => goToList("success")}
                />
              )}
            </div>
          ) : viewMode === "detail" && selectedChallenge ? (
            <div className="overflow-y-auto">
              <ChallengeDetailSheet
                challenge={selectedChallenge}
                token={token}
                role={role}
                isOwn={role === "support_crew" ? Boolean(selectedChallenge.proposedByUserId === userId) : true}
                onClose={() => goToList()}
                onStartChallenge={() => {
                  onStartChallenge?.();
                  goToList(null);
                }}
                onRequestCoordinatePick={onRequestCoordinatePick}
                onCompleteAsStory={
                  onCompleteAsStory
                    ? (challenge) => {
                        onCompleteAsStory(challenge);
                        goToList(null);
                      }
                    : undefined
                }
                onViewOnMap={
                  selectedChallenge.lat !== undefined && selectedChallenge.lon !== undefined
                    ? () => {
                        const { lat, lon } = selectedChallenge;
                        if (lat !== undefined && lon !== undefined) {
                          onRequestNavigateToChallenge?.({ lat, lon });
                        }
                        goToList("page");
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
        </div>
      </SheetContent>

      <ConfirmDelete
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this mission?"
        itemLabel={pendingDelete?.title ?? undefined}
        description="The mission is removed for everyone. Linked transactions are kept but unlinked. This can't be undone."
        onConfirm={handleConfirmDelete}
        pending={isDeleting}
      />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Traveler list view — tabs + ChallengeCard list
// ---------------------------------------------------------------------------

function TravelerListView({
  token,
  pendingOpenChallengeId,
  onClearPendingChallenge,
  onRequestNavigateToChallenge,
  onOpenDetail,
  onRequestDelete,
}: {
  token: string;
  pendingOpenChallengeId?: string | null;
  onClearPendingChallenge?: () => void;
  onRequestNavigateToChallenge?: (coord: { lat: number; lon: number }) => void;
  onOpenDetail: (c: Challenge) => void;
  onRequestDelete?: (c: Challenge) => void;
}) {
  const [filter, setFilter] = useState<TravelerFilter>("all");
  const [highlightedChallengeId, setHighlightedChallengeId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const allChallenges = useQuery(tripcastApi.challenges.travelerListChallenges, { token });

  useEffect(() => {
    if (!pendingOpenChallengeId || !allChallenges) return;
    const challenge = allChallenges.find((c) => c._id === pendingOpenChallengeId);
    if (challenge) {
      if (challenge.lat !== undefined && challenge.lon !== undefined) {
        onRequestNavigateToChallenge?.({ lat: challenge.lat, lon: challenge.lon });
      }
      const id = pendingOpenChallengeId;
      setTimeout(() => {
        document
          .querySelector(`[data-challenge-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setHighlightedChallengeId(id);
        setTimeout(() => setHighlightedChallengeId(null), 2000);
      }, 100);
      onClearPendingChallenge?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenChallengeId, allChallenges]);

  const filtered = allChallenges?.filter((c) => {
    if (filter === "all") return true;
    if (filter === "visible") return c.status === "visible" || c.status === "planned";
    return c.status === filter;
  }) ?? [];

  return (
    <>
      <SheetTabs aria-label="Challenge filters" className="mt-3">
        {TRAVELER_FILTERS.map((f) => (
          <SheetTab
            key={f.value}
            id={`challenge-tab-${f.value}`}
            aria-controls="challenge-tabpanel"
            active={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </SheetTab>
        ))}
      </SheetTabs>

      <div
        id="challenge-tabpanel"
        role="tabpanel"
        aria-labelledby={`challenge-tab-${filter}`}
        className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-4 pt-3"
      >
        {allChallenges === undefined ? (
          <PendingNotice label="Loading challenges..." />
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            {filter === "all" ? "No missions yet." : `No ${filter.replace(/_/g, " ")} missions.`}
          </p>
        ) : (
          filtered.map((c) => {
            const card = (
              <ChallengeCard
                challenge={c}
                isHighlighted={c._id === highlightedChallengeId}
                onClick={() => onOpenDetail(c)}
              />
            );
            if (!onRequestDelete) return <span key={c._id}>{card}</span>;
            return (
              <SwipeRow
                key={c._id}
                id={c._id}
                openId={swipedId}
                onOpenChange={setSwipedId}
                onEdit={() => onOpenDetail(c)}
                onDelete={() => onRequestDelete(c)}
              >
                {card}
              </SwipeRow>
            );
          })
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Traveler create form — inline, used in viewMode="create"
// ---------------------------------------------------------------------------

function TravelerCreateForm({
  token,
  onSuccess,
  onRequestCoordinatePick,
}: {
  token: string;
  onSuccess: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);
  const [costStr, setCostStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(tripcastApi.challenges.travelerCreateChallenge);

  function handlePickOnMap() {
    onRequestCoordinatePick?.((coord) => {
      setLat(coord.lat);
      setLon(coord.lon);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setIsSaving(true);
    setError(null);
    try {
      await create({
        token,
        title: title.trim(),
        description: description.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        lat,
        lon,
        estimatedCostUsd: costStr ? parseFloat(costStr) : undefined,
        estimatedDurationMinutes: durationStr ? parseInt(durationStr, 10) : undefined,
      });
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Unable to create mission.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--ink-3)]">Title</label>
        <input
          className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
          placeholder="Mission title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--ink-3)]">Location (optional)</label>
        <input
          className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
          placeholder="Place name"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          maxLength={200}
        />
        <div className="mt-1 flex items-center gap-2">
          {onRequestCoordinatePick && (
            <button
              type="button"
              className="text-xs text-[var(--ink-1)] underline"
              onClick={handlePickOnMap}
            >
              ↗ Pick on map
            </button>
          )}
          {lat !== undefined && lon !== undefined && (
            <span className="text-xs text-[var(--ink-3)]">
              📍 {lat.toFixed(5)}, {lon.toFixed(5)}
              <button
                type="button"
                className="ml-1 text-[var(--danger)] underline"
                onClick={() => { setLat(undefined); setLon(undefined); }}
              >
                clear
              </button>
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--ink-3)]">Notes (optional)</label>
        <textarea
          className="w-full resize-none rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
          placeholder="Any details…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-[var(--ink-3)]">Est. cost (USD)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
            placeholder="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-[var(--ink-3)]">Est. time (min)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
            placeholder="0"
            value={durationStr}
            onChange={(e) => setDurationStr(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
      <Button size="sm" type="submit" disabled={isSaving || !title.trim()}>
        {isSaving ? "Creating…" : "Create mission"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Crew list view — tabs + ChallengeCard list
// ---------------------------------------------------------------------------

type CrewTab = "mine" | "active";

function CrewListView({
  token,
  pendingOpenChallengeId,
  onClearPendingChallenge,
  onRequestNavigateToChallenge,
  onOpenDetail,
}: {
  token: string;
  userId?: string;
  pendingOpenChallengeId?: string | null;
  onClearPendingChallenge?: () => void;
  onRequestNavigateToChallenge?: (coord: { lat: number; lon: number }) => void;
  onOpenDetail: (c: Challenge) => void;
}) {
  const [tab, setTab] = useState<CrewTab>("active");
  const [highlightedChallengeId, setHighlightedChallengeId] = useState<string | null>(null);

  const myChallenges = useQuery(tripcastApi.challenges.followerListMyChallenges, { token });

  const mine = myChallenges?.mine ?? [];
  const publicChallenges = myChallenges?.public ?? [];
  const mineIds = new Set(mine.map((c) => c._id));

  useEffect(() => {
    if (!pendingOpenChallengeId || !myChallenges) return;
    const challenge =
      mine.find((c) => c._id === pendingOpenChallengeId) ??
      publicChallenges.find((c) => c._id === pendingOpenChallengeId);
    if (challenge) {
      if (challenge.lat !== undefined && challenge.lon !== undefined) {
        onRequestNavigateToChallenge?.({ lat: challenge.lat, lon: challenge.lon });
      }
      const id = pendingOpenChallengeId;
      setTimeout(() => {
        document
          .querySelector(`[data-challenge-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setHighlightedChallengeId(id);
        setTimeout(() => setHighlightedChallengeId(null), 2000);
      }, 100);
      onClearPendingChallenge?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenChallengeId, myChallenges]);

  return (
    <>
      <SheetTabs aria-label="Crew challenge tabs" className="mt-3">
        <SheetTab
          id="crew-tab-active"
          aria-controls="crew-tabpanel"
          active={tab === "active"}
          onClick={() => setTab("active")}
        >
          Traveler's board
        </SheetTab>
        <SheetTab
          id="crew-tab-mine"
          aria-controls="crew-tabpanel"
          active={tab === "mine"}
          onClick={() => setTab("mine")}
        >
          Mine ({mine.length})
        </SheetTab>
      </SheetTabs>

      <div
        id="crew-tabpanel"
        role="tabpanel"
        aria-labelledby={`crew-tab-${tab}`}
        className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-4 pt-3"
      >
        {myChallenges === undefined ? (
          <PendingNotice label="Loading challenges..." />
        ) : tab === "mine" ? (
          mine.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">
              You haven't proposed any missions yet.
            </p>
          ) : (
            mine.map((c) => (
              <ChallengeCard
                key={c._id}
                challenge={c}
                isOwn
                isHighlighted={c._id === highlightedChallengeId}
                onClick={() => onOpenDetail(c)}
              />
            ))
          )
        ) : publicChallenges.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            No active missions right now.
          </p>
        ) : (
          publicChallenges.map((c) => (
            <ChallengeCard
              key={c._id}
              challenge={c}
              isOwn={mineIds.has(c._id)}
              isHighlighted={c._id === highlightedChallengeId}
              onClick={() => onOpenDetail(c)}
            />
          ))
        )}
      </div>
    </>
  );
}
