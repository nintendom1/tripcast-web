import { useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Mission, MissionStatus, HistoryEvent, Role, TransactionInlineInput } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import TravelFundsInlineSection, {
  type TravelFundsInlineState,
} from "../travelfunds/TravelFundsInlineSection";
import RouteVoteSourceCard from "./RouteVoteSourceCard";
import { useDebugLogger } from "../../debug/useDebugLogger";


const RESPONSE_PRESETS = [
  "Looks good",
  "Maybe later",
  "Too far right now",
  "Too expensive right now",
  "Not enough time",
  "Already did something similar",
  "Saving this for later",
  "Not today",
];

type Props = {
  Mission: Mission | null;
  token: string;
  role: Role;
  isOwn?: boolean;
  onClose: () => void;
  onStartMission?: () => void;
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  onViewOnMap?: () => void;
  /** Mission Complete-as-Story branch — when provided and the mission is
   *  in-progress, a "Complete as story" button appears alongside the existing
   *  "Complete Mission" action. The parent (TripMap) owns the story-prefill
   *  state, opens AddCheckpointSheet, and calls travelerCompleteMission
   *  after the resulting story lands. */
  onCompleteAsStory?: (Mission: Mission, transaction?: TransactionInlineInput) => void;
  onRequestNavigateToVote?: (voteId: string) => void;
  onOpenLinkedStory?: (event: HistoryEvent) => void;
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    proposed: "Pending review",
    visible: "Accepted",
    planned: "Accepted",
    in_progress: "In progress",
    completed: "Completed",
    dropped: "Dropped",
  };
  return labels[status] ?? status;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg || "Something went wrong.";
}

export default function MissionDetailSheet({
  Mission,
  token,
  role,
  isOwn,
  onClose,
  onStartMission,
  onRequestCoordinatePick,
  onViewOnMap,
  onCompleteAsStory,
  onRequestNavigateToVote,
  onOpenLinkedStory,
}: Props) {
  const log = useDebugLogger("MissionDetailSheet", "src/features/missions/MissionDetailSheet.tsx");

  // Drop/reject form state
  const [responseNote, setResponseNote] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkInProgressConfirm, setShowMarkInProgressConfirm] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLat, setEditLat] = useState<number | undefined>(undefined);
  const [editLon, setEditLon] = useState<number | undefined>(undefined);
  const [editCost, setEditCost] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editEnergy, setEditEnergy] = useState<"" | "low" | "medium" | "high">("");
  const [editStatus, setEditStatus] = useState<MissionStatus>("visible");

  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [completionTxState, setCompletionTxState] = useState<TravelFundsInlineState>(null);

  const accept = useMutation(tripcastApi.missions.travelerAcceptMission);
  const drop = useMutation(tripcastApi.missions.travelerDropMission);
  const deleteSilently = useMutation(tripcastApi.missions.travelerDeleteMission);
  const edit = useMutation(tripcastApi.missions.travelerEditMission);
  const start = useMutation(tripcastApi.missions.travelerStartMission);
  const complete = useMutation(tripcastApi.missions.travelerCompleteMission);
  const togglePin = useMutation(tripcastApi.missions.travelerToggleMissionMapPin);
  const withdraw = useMutation(tripcastApi.missions.followerWithdrawMission);
  const updateStatus = useMutation(tripcastApi.routeVotes.travelerUpdateMissionStatus);
  const setCurrentActivity = useMutation(tripcastApi.currentActivity.travelerSetCurrentActivity);

  // Live Mission subscription — keeps the detail view in sync after edits.
  const liveMission = useQuery(
    tripcastApi.missions.getMission,
    Mission ? { token, missionId: Mission._id } : "skip",
  );
  const c = liveMission ?? Mission;

  const currentActivity = useQuery(
    tripcastApi.currentActivity.travelerGetCurrentActivity,
    role === "traveler" ? { token } : "skip",
  );
  const inProgressMissions = useQuery(
    tripcastApi.missions.travelerListMissions,
    role === "traveler" ? { token, status: "in_progress" } : "skip",
  );

  // Linked story detection — Convex deduplicates with TripMap's existing subscription.
  const allHistoryEvents = useQuery(tripcastApi.historyEvents.listHistoryEvents, { token }) ?? [];
  const linkedStory = allHistoryEvents.find(
    (e) => e.type === "check_in" && e.missionId === c?._id,
  ) ?? null;

  if (!c) return null;

  const isTraveler = role === "traveler";
  const canAct = !isWorking;
  const status = c.status;
  const hasLocation = c.lat !== undefined && c.lon !== undefined;
  const conflictingMission = (inProgressMissions ?? []).find((ch) => ch._id !== c._id) ?? null;

  function openEditMode() {
    log.logForm("form:open");
    setEditTitle(c!.title);
    setEditDesc(c!.description ?? "");
    setEditLocation(c!.locationLabel ?? "");
    setEditLat(c!.lat);
    setEditLon(c!.lon);
    setEditCost(c!.estimatedCostUsd !== undefined ? String(c!.estimatedCostUsd) : "");
    setEditDuration(
      c!.estimatedDurationMinutes !== undefined
        ? String(c!.estimatedDurationMinutes)
        : "",
    );
    setEditEnergy((c!.estimatedEnergyImpact as "" | "low" | "medium" | "high") ?? "");
    setEditStatus(c!.status);
    setIsEditing(true);
    setActionError(null);
  }

  function cancelEditMode() {
    setIsEditing(false);
    setActionError(null);
  }

  async function handleSaveEdit() {
    if (!c || !editTitle.trim()) {
      setActionError("Title is required.");
      return;
    }
    setIsWorking(true);
    setActionError(null);
    log.logForm("form:submit");
    try {
      await edit({
        token,
        missionId: c!._id,
        title: editTitle,
        description: editDesc.trim() || undefined,
        locationLabel: editLocation.trim() || undefined,
        lat: editLat,
        lon: editLon,
        estimatedCostUsd: editCost ? parseFloat(editCost) : undefined,
        estimatedDurationMinutes: editDuration ? parseInt(editDuration, 10) : undefined,
        estimatedEnergyImpact: editEnergy || undefined,
      });
      if (editStatus !== c!.status) {
        log.logMutation("Mission:status:update", { from: c!.status, to: editStatus });
        await updateStatus({ token, missionId: c!._id, newStatus: editStatus });
        log.logMutation("Mission:status:update:success");
        log.logState("MissionStatus", c!.status, editStatus);
      }
      setIsEditing(false);
    } catch (e) {
      log.error("Mission:edit:error", "mutation", { message: String(e) });
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function handlePickEditCoordinates() {
    onRequestCoordinatePick?.((coord) => {
      setEditLat(coord.lat);
      setEditLon(coord.lon);
    });
  }

  async function handleAccept() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await accept({
        token,
        missionId: Mission._id,
        responseNote: responseNote || undefined,
        responsePreset: selectedPreset || undefined,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReject() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await drop({
        token,
        missionId: Mission._id,
        responseNote: responseNote || undefined,
        responsePreset: selectedPreset || undefined,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteSilently() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await deleteSilently({ token, missionId: Mission._id });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleStart() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await start({ token, missionId: Mission._id });
      onStartMission?.();
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleComplete() {
    if (!Mission) return;
    // Block save when the inline Travel Funds section is open with
    // partial/invalid data — surface the error rather than silently dropping
    // the transaction.
    if (completionTxState && "error" in completionTxState) {
      setActionError(completionTxState.error);
      return;
    }
    const inlineTransaction =
      completionTxState && "value" in completionTxState
        ? completionTxState.value
        : undefined;
    setIsWorking(true);
    setActionError(null);
    try {
      await complete({
        token,
        missionId: Mission._id,
        transaction: inlineTransaction,
      });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function handleCompleteAsStory() {
    if (!Mission || !onCompleteAsStory) return;
    if (completionTxState && "error" in completionTxState) {
      setActionError(completionTxState.error);
      return;
    }
    const transaction =
      completionTxState && "value" in completionTxState ? completionTxState.value : undefined;
    onCompleteAsStory(Mission, transaction);
  }

  async function handleMarkInProgress() {
    setShowMarkInProgressConfirm(false);
    setIsWorking(true);
    setActionError(null);
    try {
      await start({ token, missionId: c!._id });
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSetCurrentActivity() {
    setIsWorking(true);
    setActionError(null);
    try {
      await setCurrentActivity({
        token,
        title: c!.title,
        linkedMissionId: c!._id,
        locationLabel: c!.locationLabel,
        lat: c!.lat,
        lon: c!.lon,
      });
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleTogglePin() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await togglePin({ token, missionId: Mission._id, hidden: !Mission.mapHidden });
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleWithdraw() {
    if (!Mission) return;
    setIsWorking(true);
    setActionError(null);
    try {
      await withdraw({ token, missionId: Mission._id });
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  if (isEditing) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-navy">Edit Mission</span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={cancelEditMode}
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          The follower will see the edits to the Mission.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            placeholder="Mission title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <Textarea
            placeholder="Any details…"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Location label (optional)</label>
          <Input
            placeholder="Place name"
            value={editLocation}
            onChange={(e) => setEditLocation(e.target.value)}
            maxLength={200}
          />
          <div className="flex items-center gap-2 mt-1">
            {onRequestCoordinatePick && (
              <button
                type="button"
                className="text-xs text-navy underline"
                onClick={handlePickEditCoordinates}
              >
                ↗ Pick on map
              </button>
            )}
            {editLat !== undefined && editLon !== undefined && (
              <span className="text-xs text-muted-foreground">
                📍 {editLat.toFixed(5)}, {editLon.toFixed(5)}
                <button
                  type="button"
                  className="ml-1 text-rose-500 underline"
                  onClick={() => { setEditLat(undefined); setEditLon(undefined); }}
                >
                  clear
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground">Est. cost (USD, optional)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground">Est. duration (min, optional)</label>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="60"
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Energy impact (optional)</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  editEnergy === level
                    ? "bg-navy text-white border-navy"
                    : "bg-white text-navy border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => setEditEnergy(editEnergy === level ? "" : level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as MissionStatus)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="planned">Planned</option>
            <option value="visible">Visible</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>

        {actionError && (
          <p className="text-sm text-rose-600" role="alert">{actionError}</p>
        )}

        <Button
          size="sm"
          type="button"
          disabled={isWorking || !editTitle.trim()}
          onClick={handleSaveEdit}
        >
          {isWorking ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Normal detail view
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      {/* Status badge + Edit button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
        {isTraveler && (
          <button
            type="button"
            className="text-xs text-navy underline"
            onClick={openEditMode}
          >
            Edit
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-navy">{c.title}</h2>
        {c.description && (
          <p className="text-sm text-muted-foreground">{c.description}</p>
        )}
      </div>

      {/* Add a story — top placement for completed missions without a linked story yet */}
      {isTraveler && status === "completed" && onCompleteAsStory && !linkedStory && (
        <Button
          size="sm"
          type="button"
          disabled={!canAct}
          onClick={handleCompleteAsStory}
          className="border-[var(--plum)] text-white w-fit"
          style={{ background: "var(--plum)" }}
        >
          Add a story
        </Button>
      )}

      {/* Meta */}
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {c.locationLabel && <span>📍 {c.locationLabel}</span>}
        {!hasLocation && <span className="text-xs italic">No map location (text-only Mission)</span>}
        {c.estimatedDurationMinutes && (
          <span>⏱ Est. {c.estimatedDurationMinutes} min</span>
        )}
        {c.estimatedCostUsd !== undefined && (
          <span>💰 Est. ${c.estimatedCostUsd.toFixed(2)} USD</span>
        )}
        {c.estimatedEnergyImpact && (
          <span>⚡ Energy: {c.estimatedEnergyImpact}</span>
        )}
      </div>

      {/* Route vote source card — shown when mission originated from a vote */}
      {c.sourceRouteVoteId && (
        <RouteVoteSourceCard
          sourceVoteId={c.sourceRouteVoteId}
          sourceOptionId={c.sourceRouteVoteOptionId}
          token={token}
          onNavigate={onRequestNavigateToVote}
        />
      )}

      {/* Linked story card — shown when a story has been filed against this mission */}
      {isTraveler && linkedStory && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linked story</p>
          <p className="text-sm font-medium text-navy line-clamp-1">{linkedStory.title ?? "Story"}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(linkedStory.occurredAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          </p>
          {onOpenLinkedStory && (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => { log.logUi("action:view-linked-story"); onOpenLinkedStory(linkedStory); }}
            >
              View story
            </Button>
          )}
        </div>
      )}

      {/* Traveler response (preset + note) — visible to both traveler and follower */}
      {(c.travelerResponsePreset || c.travelerResponseNote) && !c.silentDrop && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3 flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Traveler's response</p>
          {c.travelerResponsePreset && (
            <span className="self-start px-2.5 py-0.5 text-xs rounded-full bg-navy/10 text-navy font-medium">
              {c.travelerResponsePreset}
            </span>
          )}
          {c.travelerResponseNote && (
            <p className="text-sm text-foreground">{c.travelerResponseNote}</p>
          )}
        </div>
      )}

      {/* Reject with response form */}
      {isTraveler && showRejectForm && (
        <div className="flex flex-col gap-3 border border-slate-200 rounded-lg p-3">
          <div className="flex flex-wrap gap-2">
            {RESPONSE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  selectedPreset === preset
                    ? "bg-navy text-white border-navy"
                    : "bg-white text-navy border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => setSelectedPreset(selectedPreset === preset ? "" : preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <Textarea
            placeholder="Custom response note (optional)…"
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setResponseNote("");
                setSelectedPreset("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleReject}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              {isWorking ? "Dropping…" : "Confirm drop"}
            </Button>
          </div>
        </div>
      )}

      {/* Delete silently confirmation */}
      {isTraveler && showDeleteConfirm && (
        <div className="flex flex-col gap-3 border border-rose-200 rounded-lg p-3 bg-rose-50">
          <p className="text-sm text-rose-800">
            This permanently deletes the Mission — the proposer will no longer see it. Are you sure?
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleDeleteSilently}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              {isWorking ? "Deleting…" : "Yes, delete"}
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-sm text-rose-600" role="alert">{actionError}</p>
      )}

      {/* Traveler actions (hidden while reject form or delete confirm is open) */}
      {isTraveler && !showRejectForm && !showDeleteConfirm && (
        <div className="flex flex-col gap-2">
          {status === "proposed" && (
            <>
              <Button size="sm" type="button" disabled={!canAct} onClick={handleAccept}>
                Accept and publish
              </Button>
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => conflictingMission ? setShowMarkInProgressConfirm(true) : handleMarkInProgress()}
              >
                Mark &lsquo;In Progress&rsquo;
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with response
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}

          {showMarkInProgressConfirm && conflictingMission && (
            <div className="flex flex-col gap-3 border border-amber-200 rounded-lg p-3 bg-amber-50">
              <p className="text-sm text-amber-800">
                &ldquo;{conflictingMission.title}&rdquo; is currently in progress. Starting this mission will drop it.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setShowMarkInProgressConfirm(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" type="button" disabled={!canAct} onClick={handleMarkInProgress}>
                  Proceed
                </Button>
              </div>
            </div>
          )}

          {(status === "visible" || status === "planned") && (
            <>
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => conflictingMission ? setShowMarkInProgressConfirm(true) : handleMarkInProgress()}
              >
                Mark &lsquo;In Progress&rsquo;
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleTogglePin}
              >
                {c.mapHidden ? "Show on map" : "Hide from map"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with note
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}

          {status === "in_progress" && (
            <>
              {currentActivity?.linkedMissionId !== c._id && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={!canAct}
                  onClick={handleSetCurrentActivity}
                >
                  Set Current Activity to This Mission
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Completing this Mission will mark the linked Current Activity as done and open the Story form.
              </p>
              {isTraveler && (
                <TravelFundsInlineSection
                  token={token}
                  prefill={{
                    title: c.title,
                    ...(c.estimatedCostUsd !== undefined
                      ? {
                          localAmount: c.estimatedCostUsd,
                          currencyCode: "USD",
                          localCurrencyPerUsd: 1,
                        }
                      : {}),
                  }}
                  onChange={setCompletionTxState}
                />
              )}
              {onCompleteAsStory && (
                <Button
                  size="sm"
                  type="button"
                  disabled={!canAct}
                  onClick={handleCompleteAsStory}
                  className="border-[var(--plum)] text-white"
                  style={{ background: "var(--plum)" }}
                >
                  Complete as story
                </Button>
              )}
              <Button
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={handleComplete}
                className="bg-green-600 hover:bg-green-700 text-white border-green-600"
              >
                {onCompleteAsStory ? "Mark complete (no story)" : "Complete Mission"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowRejectForm(true)}
              >
                Drop with note
              </Button>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-rose-200" />
                <span className="text-[10px] text-rose-400 font-medium uppercase tracking-wide">⚠ Danger</span>
                <div className="flex-1 h-px bg-rose-200" />
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!canAct}
                onClick={() => setShowDeleteConfirm(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                Delete silently
              </Button>
            </>
          )}
        </div>
      )}

      {/* Support crew: withdraw own proposed Mission */}
      {!isTraveler && isOwn && status === "proposed" && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!canAct}
          onClick={handleWithdraw}
          className="border-rose-300 text-rose-700 hover:bg-rose-50 w-fit"
        >
          Withdraw proposal
        </Button>
      )}
    </div>
  );
}
