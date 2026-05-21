import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Mission, JournalEvent, Role, TransactionInlineInput } from "../../convex/tripcastApi";
import { getLocalDateKey } from "../achievements/dateUtils";
import MissionCard from "./MissionCard";
import MissionProposalForm from "./MissionProposalForm";
import MissionDetailSheet from "./MissionDetailSheet";
import {
  Sheet,
  SheetBackButton,
  SheetBody,
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
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { TERMS } from "../../copy/terminology";

type Props = {
  open: boolean;
  token: string;
  role: Role;
  sessionId?: string;
  userId?: string;
  onClose: () => void;
  onStartMission?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  isPickingCoordinate?: boolean;
  pendingOpenMissionId?: string | null;
  onClearPendingMission?: () => void;
  onRequestNavigateToMission?: (coord: { lat: number; lon: number }) => void;
  onCompleteAsStory?: (Mission: Mission, transaction?: TransactionInlineInput) => void;
  /** When set + the panel is open, navigate straight to the matching mission's
   *  detail view rather than the list. Used by the Complete-as-Story → Back
   *  flow so dismissing the story form returns the Traveler to the mission's
   *  full action set. Parent clears via `onClearPendingDetail` once we land. */
  pendingOpenDetailMissionId?: string | null;
  onClearPendingDetail?: () => void;
  onRequestNavigateToVote?: (voteId: string) => void;
  onOpenLinkedStory?: (event: JournalEvent) => void;
  debugSource?: { source: string; sourceLabel: string };
};

type ViewMode = "list" | "create" | "detail";
type SelectedMission = { Mission: Mission; isOwn: boolean };

type TravelerFilter = "all" | "proposed" | "visible" | "in_progress" | "completed" | "dropped";

const TRAVELER_FILTERS: { value: TravelerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "proposed", label: "Proposed" },
  { value: "visible", label: "Visible" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const TITLE_BY_VIEW: Record<ViewMode, { traveler: string; follower: string }> = {
  list: { traveler: TERMS.missions, follower: TERMS.missions },
  create: { traveler: `New ${TERMS.mission.toLowerCase()}`, follower: `Propose ${TERMS.mission.toLowerCase()}` },
  detail: { traveler: TERMS.mission, follower: TERMS.mission },
};

// ---------------------------------------------------------------------------
// Main panel — owns the internal list / create / detail nav stack
// ---------------------------------------------------------------------------

export default function MissionPanel({
  open,
  token,
  role,
  userId,
  onClose,
  onStartMission,
  onRequestCoordinatePick,
  isPickingCoordinate,
  pendingOpenMissionId,
  onClearPendingMission,
  onRequestNavigateToMission,
  onCompleteAsStory,
  pendingOpenDetailMissionId,
  onClearPendingDetail,
  onRequestNavigateToVote,
  onOpenLinkedStory,
  debugSource,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedMission, setSelectedMission] = useState<SelectedMission | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Mission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const music = useMusicSafe();
  const log = useDebugLogger("MissionPanel", "src/features/missions/MissionPanel.tsx");
  useActiveUiContext(open, {
    sheetName: "MissionPanel",
    label: TERMS.missions,
    view: viewMode,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/missions/MissionPanel.tsx",
  }, { boundsSelector: "[data-role='missions-sheet']" });
  const deleteMission = useMutation(tripcastApi.missions.travelerDeleteMission);

  async function handleConfirmDelete() {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteMission({ token, missionId: pendingDelete._id });
      music.sfx("success");
      setPendingDelete(null);
    } catch {
      // Mutation already shows the user-friendly error inline via MissionDetailSheet
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
      setSelectedMission(null);
    }
  }, [open]);

  // Pin-driven navigation: the parent passes a Mission id to focus on; we
  // always return the panel to its list view (and trust the parent to recenter
  // the map) so the user can see the row highlight rather than the detail.
  useEffect(() => {
    if (!pendingOpenMissionId) return;
    setViewMode("list");
    setSelectedMission(null);
  }, [pendingOpenMissionId]);

  // Back-from-story navigation: the parent (TripMap) sets this when the
  // Traveler hits "← Back" inside AddCheckpointSheet's mission-completion
  // mode. We look up the Mission by id and drop the user straight back on
  // the same mission's detail view so the four-button action set is visible.
  const pendingDetailMission = useQuery(
    tripcastApi.missions.getMission,
    pendingOpenDetailMissionId && open
      ? { token, missionId: pendingOpenDetailMissionId }
      : "skip",
  );

  useEffect(() => {
    if (!open || !pendingOpenDetailMissionId) return;
    if (pendingDetailMission === undefined) return; // still loading
    if (pendingDetailMission === null) {
      // Mission was deleted while the user was writing the story — fall back
      // to the list view and clear the pending id so we don't loop.
      onClearPendingDetail?.();
      setViewMode("list");
      setSelectedMission(null);
      return;
    }
    setSelectedMission({
      Mission: pendingDetailMission,
      isOwn: role === "traveler" || Boolean(pendingDetailMission.proposedByUserId === userId),
    });
    setViewMode("detail");
    onClearPendingDetail?.();
    // pendingDetailMission / onClearPendingDetail are stable enough for the
    // one-shot navigation behavior we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingOpenDetailMissionId, pendingDetailMission]);

  // Entering the detail view auto-focuses the map on the mission's coordinates
  // — same UX as opening a story. The explicit "View on map" link in the
  // detail body remains useful for re-centering after the user has panned away.
  useEffect(() => {
    if (viewMode !== "detail" || !selectedMission) return;
    if (selectedMission.Mission.lat === undefined || selectedMission.Mission.lon === undefined) return;
    onRequestNavigateToMission?.({
      lat: selectedMission.Mission.lat,
      lon: selectedMission.Mission.lon,
    });
    // onRequestNavigateToMission is stable enough for our purposes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedMission?.Mission._id]);

  function goToList(sound: "page" | "success" | null = "page") {
    log.logInteraction("view:change", { from: viewMode, to: "list" });
    if (sound) music.sfx(sound);
    setViewMode("list");
    setSelectedMission(null);
  }

  function goToCreate() {
    log.logInteraction("view:change", { from: viewMode, to: "create" });
    music.sfx("page");
    setSelectedMission(null);
    setViewMode("create");
  }

  function goToDetail(Mission: Mission, isOwn = role === "traveler") {
    log.logInteraction("view:change", { from: viewMode, to: "detail", missionId: Mission._id, status: Mission.status });
    music.sfx("page");
    setSelectedMission({ Mission, isOwn });
    setViewMode("detail");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isPickingCoordinate) {
      onClose();
    }
  }

  const isTraveler = role === "traveler";
  const headerTitle = isTraveler ? TITLE_BY_VIEW[viewMode].traveler : TITLE_BY_VIEW[viewMode].follower;
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
              <SheetKicker dotColor="var(--plum)">{TERMS.missions}</SheetKicker>
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
                aria-label={isTraveler ? `Create ${TERMS.mission.toLowerCase()}` : `Propose ${TERMS.mission.toLowerCase()}`}
                className="rounded-full"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {isTraveler ? "New" : "Propose"}
              </Button>
            ) : null}
            <SheetCloseButton aria-label="Close missions panel" />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          {viewMode === "list" ? (
            isTraveler ? (
              <TravelerListView
                token={token}
                pendingOpenMissionId={pendingOpenMissionId}
                onClearPendingMission={onClearPendingMission}
                onRequestNavigateToMission={onRequestNavigateToMission}
                onOpenDetail={goToDetail}
                onRequestDelete={(c) => setPendingDelete(c)}
              />
            ) : (
              <FollowerListView
                token={token}
                userId={userId}
                pendingOpenMissionId={pendingOpenMissionId}
                onClearPendingMission={onClearPendingMission}
                onRequestNavigateToMission={onRequestNavigateToMission}
                onOpenDetail={goToDetail}
              />
            )
          ) : viewMode === "create" ? (
            <SheetBody className="flex flex-1 min-h-0 flex-col px-4 pb-4 pt-3">
              {isTraveler ? (
                <TravelerCreateForm
                  token={token}
                  onRequestCoordinatePick={onRequestCoordinatePick}
                  onSuccess={() => goToList("success")}
                />
              ) : (
                <MissionProposalForm
                  token={token}
                  onRequestCoordinatePick={onRequestCoordinatePick}
                  onSuccess={() => goToList("success")}
                />
              )}
            </SheetBody>
          ) : viewMode === "detail" && selectedMission ? (
            <SheetBody className="p-0">
              <MissionDetailSheet
                Mission={selectedMission.Mission}
                token={token}
                role={role}
                isOwn={selectedMission.isOwn}
                onClose={() => goToList()}
                onStartMission={() => {
                  onStartMission?.();
                  goToList(null);
                }}
                onRequestCoordinatePick={onRequestCoordinatePick}
                onCompleteAsStory={
                  onCompleteAsStory
                    ? (Mission, transaction) => {
                        onCompleteAsStory(Mission, transaction);
                        goToList(null);
                      }
                    : undefined
                }
                onViewOnMap={
                  selectedMission.Mission.lat !== undefined && selectedMission.Mission.lon !== undefined
                    ? () => {
                        const { lat, lon } = selectedMission.Mission;
                        if (lat !== undefined && lon !== undefined) {
                          onRequestNavigateToMission?.({ lat, lon });
                        }
                        goToList("page");
                      }
                    : undefined
                }
                onRequestNavigateToVote={onRequestNavigateToVote}
                onOpenLinkedStory={onOpenLinkedStory}
                debugSource={debugSource}
              />
            </SheetBody>
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
// Traveler list view — tabs + MissionCard list
// ---------------------------------------------------------------------------

function TravelerListView({
  token,
  pendingOpenMissionId,
  onClearPendingMission,
  onRequestNavigateToMission,
  onOpenDetail,
  onRequestDelete,
}: {
  token: string;
  pendingOpenMissionId?: string | null;
  onClearPendingMission?: () => void;
  onRequestNavigateToMission?: (coord: { lat: number; lon: number }) => void;
  onOpenDetail: (c: Mission, isOwn?: boolean) => void;
  onRequestDelete?: (c: Mission) => void;
}) {
  const [filter, setFilter] = useState<TravelerFilter>("all");
  const [highlightedMissionId, setHighlightedMissionId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const highlightTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const allMissions = useQuery(tripcastApi.missions.travelerListMissions, { token });
  const log = useDebugLogger("MissionPanel", "src/features/missions/MissionPanel.tsx");

  function clearHighlightTimers() {
    for (const timer of highlightTimersRef.current) {
      clearTimeout(timer);
    }
    highlightTimersRef.current = [];
  }

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current) {
        clearTimeout(timer);
      }
      highlightTimersRef.current = [];
    };
  }, []);

  function queueMissionHighlight(id: string) {
    clearHighlightTimers();
    const scrollTimer = setTimeout(() => {
      document
        .querySelector(`[data-mission-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHighlightedMissionId(id);
      const clearTimer = setTimeout(() => setHighlightedMissionId(null), 2000);
      highlightTimersRef.current = [clearTimer];
    }, 100);
    highlightTimersRef.current = [scrollTimer];
  }

  useEffect(() => {
    if (!pendingOpenMissionId || !allMissions) return;
    const Mission = allMissions.find((c) => c._id === pendingOpenMissionId);
    if (Mission) {
      if (Mission.lat !== undefined && Mission.lon !== undefined) {
        onRequestNavigateToMission?.({ lat: Mission.lat, lon: Mission.lon });
      }
      const id = pendingOpenMissionId;
      queueMissionHighlight(id);
      onClearPendingMission?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenMissionId, allMissions]);

  const filtered = allMissions?.filter((c) => {
    if (filter === "all") return true;
    if (filter === "visible") return c.status === "visible" || c.status === "planned";
    return c.status === filter;
  }) ?? [];

  return (
    <>
      <SheetTabs aria-label="Mission filters" className="mt-3 gap-1.5 pb-3">
        {TRAVELER_FILTERS.map((f) => (
          <SheetTab
            key={f.value}
            id={`Mission-tab-${f.value}`}
            aria-controls="Mission-tabpanel"
            active={filter === f.value}
            onClick={() => { log.logInteraction("filter:change", { from: filter, to: f.value }); setFilter(f.value); }}
          >
            {f.label}
          </SheetTab>
        ))}
      </SheetTabs>

      <SheetBody
        id="Mission-tabpanel"
        role="tabpanel"
        aria-labelledby={`Mission-tab-${filter}`}
        className="min-h-0 space-y-2 px-4 pb-4 pt-3"
      >
        {allMissions === undefined ? (
          <PendingNotice label="Loading missions..." />
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            {filter === "all" ? "No missions yet." : `No ${filter.replace(/_/g, " ")} missions.`}
          </p>
        ) : (
          filtered.map((c) => {
            const card = (
              <MissionCard
                Mission={c}
                token={token}
                isHighlighted={c._id === highlightedMissionId}
                onClick={() => onOpenDetail(c)}
              />
            );
            if (!onRequestDelete) return <div key={c._id}>{card}</div>;
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
      </SheetBody>
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

  const create = useMutation(tripcastApi.missions.travelerCreateMission);

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
        clientLocalDate: getLocalDateKey(),
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
// Follower list view - tabs + MissionCard list
// ---------------------------------------------------------------------------

type FollowerTab = "mine" | "active";

function FollowerListView({
  token,
  pendingOpenMissionId,
  onClearPendingMission,
  onRequestNavigateToMission,
  onOpenDetail,
}: {
  token: string;
  userId?: string;
  pendingOpenMissionId?: string | null;
  onClearPendingMission?: () => void;
  onRequestNavigateToMission?: (coord: { lat: number; lon: number }) => void;
  onOpenDetail: (c: Mission, isOwn?: boolean) => void;
}) {
  const [tab, setTab] = useState<FollowerTab>("active");
  const [highlightedMissionId, setHighlightedMissionId] = useState<string | null>(null);
  const highlightTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const myMissions = useQuery(tripcastApi.missions.followerListMyMissions, { token });

  const mine = myMissions?.mine ?? [];
  const publicMissions = myMissions?.public ?? [];
  const mineIds = new Set(mine.map((c) => c._id));

  function clearHighlightTimers() {
    for (const timer of highlightTimersRef.current) {
      clearTimeout(timer);
    }
    highlightTimersRef.current = [];
  }

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current) {
        clearTimeout(timer);
      }
      highlightTimersRef.current = [];
    };
  }, []);

  function queueMissionHighlight(id: string) {
    clearHighlightTimers();
    const scrollTimer = setTimeout(() => {
      document
        .querySelector(`[data-mission-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setHighlightedMissionId(id);
      const clearTimer = setTimeout(() => setHighlightedMissionId(null), 2000);
      highlightTimersRef.current = [clearTimer];
    }, 100);
    highlightTimersRef.current = [scrollTimer];
  }

  useEffect(() => {
    if (!pendingOpenMissionId || !myMissions) return;
    const Mission =
      mine.find((c) => c._id === pendingOpenMissionId) ??
      publicMissions.find((c) => c._id === pendingOpenMissionId);
    if (Mission) {
      if (Mission.lat !== undefined && Mission.lon !== undefined) {
        onRequestNavigateToMission?.({ lat: Mission.lat, lon: Mission.lon });
      }
      const id = pendingOpenMissionId;
      queueMissionHighlight(id);
      onClearPendingMission?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenMissionId, myMissions]);

  return (
    <>
      <SheetTabs aria-label="Follower mission tabs" className="mt-3 gap-1.5 pb-3">
        <SheetTab
          id="follower-tab-active"
          aria-controls="follower-tabpanel"
          active={tab === "active"}
          onClick={() => setTab("active")}
        >
          Traveler's board
        </SheetTab>
        <SheetTab
          id="follower-tab-mine"
          aria-controls="follower-tabpanel"
          active={tab === "mine"}
          onClick={() => setTab("mine")}
        >
          Mine ({mine.length})
        </SheetTab>
      </SheetTabs>

      <SheetBody
        id="follower-tabpanel"
        role="tabpanel"
        aria-labelledby={`follower-tab-${tab}`}
        className="min-h-0 space-y-2 px-4 pb-4 pt-3"
      >
        {myMissions === undefined ? (
          <PendingNotice label="Loading missions..." />
        ) : tab === "mine" ? (
          mine.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">
              You haven't proposed any missions yet.
            </p>
          ) : (
            mine.map((c) => (
              <div key={c._id}>
                <MissionCard
                  Mission={c}
                  token={token}
                  isOwn
                  isHighlighted={c._id === highlightedMissionId}
                  onClick={() => onOpenDetail(c, true)}
                />
              </div>
            ))
          )
        ) : publicMissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            No active missions right now.
          </p>
        ) : (
          publicMissions.map((c) => (
            <div key={c._id}>
              <MissionCard
                Mission={c}
                token={token}
                isOwn={mineIds.has(c._id)}
                isHighlighted={c._id === highlightedMissionId}
                onClick={() => onOpenDetail(c, mineIds.has(c._id))}
              />
            </div>
          ))
        )}
      </SheetBody>
    </>
  );
}
