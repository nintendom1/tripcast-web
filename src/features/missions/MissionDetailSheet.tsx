import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, MapPin, RadioTower } from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { Mission, MissionStatus, JournalEvent, Role } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { LocationPickerField } from "../map/MapPicker";
import LinkedTransactionsSection from "../travelfunds/LinkedTransactionsSection";
import RouteVoteSourceCard from "./RouteVoteSourceCard";
import AttributionBlock from "../attributions/AttributionBlock";
import AwardBadgeSheet from "../achievements/AwardBadgeSheet";
import MysteryMissionEditSheet from "./MysteryMissionEditSheet";
import CrypticText from "./CrypticText";
import { ReactionSection } from "../../components/ui/ReactionSection";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { cn } from "@/lib/utils";


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

const missionLabelClass = "text-xs font-medium text-[var(--ink-3)]";
const missionHintClass = "text-xs text-[var(--ink-3)]";
const missionErrorClass = "text-sm text-[var(--ink-danger)]";
const dangerDividerClass = "flex-1 h-px bg-[var(--bg-danger)] opacity-60";
const dangerLabelClass = "text-[10px] text-[var(--ink-danger)] font-medium uppercase tracking-wide";
const dangerButtonClass = "border-[var(--ink-danger)] bg-[var(--bg-danger)] text-[var(--ink-danger)] hover:bg-[var(--bg-danger)] hover:text-[var(--ink-danger)] hover:opacity-90";
const primaryDangerButtonClass = "border-[var(--ink-danger)] bg-[var(--ink-danger)] text-[var(--bg-paper)] hover:bg-[var(--ink-danger)] hover:opacity-90";
const missionSelectClass = "h-9 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--flag)] focus:ring-1 focus:ring-[var(--flag)]";
const energyChipBaseClass = "rounded-full border px-3 py-1 text-xs transition-colors";
const energyChipActiveClass = "border-[var(--flag)] bg-[var(--flag)] text-[var(--ink-on-brand)]";
const energyChipIdleClass = "border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--ink-2)] hover:bg-[var(--meter-track)]";

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
  onCompleteAsStory?: (Mission: Mission) => void;
  onRequestNavigateToVote?: (voteId: string) => void;
  onOpenLinkedStory?: (event: JournalEvent) => void;
  onMysteryMissionReveal?: () => void;
  /** Provenance for the debug "Active UI Context" — where the detail was opened
   *  from. Threaded down from MissionPanel. */
  debugSource?: { source: string; sourceLabel: string };
};

function statusLabel(status: string, source?: string): string {
  if (source === "mystery") {
    const mysteryLabels: Record<string, string> = {
      proposed: "Unlocked",
      visible: "Unlocked",
      planned: "Unlocked",
      in_progress: "Active",
      completed: "Completed",
      dropped: "Dropped",
    };
    return mysteryLabels[status] ?? status;
  }
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

/** Stamped, prototype-style section heading used to split the detail into
 *  Next Steps / About / Linked areas. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-[var(--font-display)] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--ink-3)]">
      {children}
    </div>
  );
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
  onMysteryMissionReveal,
  debugSource,
}: Props) {
  const log = useDebugLogger("MissionDetailSheet", "src/features/missions/MissionDetailSheet.tsx");

  // Drop/reject form state
  const [responseNote, setResponseNote] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkInProgressConfirm, setShowMarkInProgressConfirm] = useState(false);
  // Manual status override — kept in the Next Steps area so lifecycle changes
  // stay separate from the About/Edit field form.
  const [showStatusOverride, setShowStatusOverride] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<MissionStatus>("visible");

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

  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);
  const [mysteryEditOpen, setMysteryEditOpen] = useState(false);

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
  const mysteryMissionId = c?.source === "mystery" ? c.sourceMysteryMissionId : undefined;
  const linkedMysteryMission = useQuery(
    tripcastApi.mysteryMissions.getMysteryMission,
    mysteryMissionId ? { token, mysteryMissionId } : "skip",
  );

  const currentActivity = useQuery(
    tripcastApi.currentActivity.travelerGetCurrentActivity,
    role === "traveler" ? { token } : "skip",
  );
  const inProgressMissions = useQuery(
    tripcastApi.missions.travelerListMissions,
    role === "traveler" ? { token, status: "in_progress" } : "skip",
  );

  // Linked story detection — Convex deduplicates with TripMap's existing subscription.
  const allJournalEvents = useQuery(tripcastApi.journalEvents.listJournalEvents, { token }) ?? [];
  const linkedStory = allJournalEvents.find(
    (e) => e.type === "story" && e.missionId === c?._id,
  ) ?? null;

  // Surface the Mission detail in the debug "Active UI Context", mirroring
  // StoryDetailSheet. The detail is rendered inside MissionPanel's sheet, so it
  // pushes a context on top of the panel's while open; `view` flips to "edit"
  // when the Traveler enters the inline edit mode.
  useActiveUiContext(Boolean(c), {
    sheetName: "MissionDetailSheet",
    label: "Mission detail",
    view: isEditing ? "edit" : "detail",
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/missions/MissionDetailSheet.tsx",
  }, { boundsSelector: "[data-role='missions-sheet']" });

  if (!c) return null;

  const isTraveler = role === "traveler";
  const canAct = !isWorking;
  const status = c.status;
  const isMysteryMission = c.source === "mystery";
  const hasLocation = c.lat !== undefined && c.lon !== undefined;
  const conflictingMission = (inProgressMissions ?? []).find((ch) => ch._id !== c._id) ?? null;
  const hasMeta =
    Boolean(c.locationLabel) ||
    !hasLocation ||
    c.estimatedDurationMinutes !== undefined ||
    c.estimatedCostUsd !== undefined ||
    Boolean(c.estimatedEnergyImpact);

  function openEditMode() {
    log.logUi("action:edit-open", { missionId: c!._id });
    if (c!.source === "mystery" && c!.sourceMysteryMissionId) {
      setMysteryEditOpen(true);
      setActionError(null);
      return;
    }
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
    setIsEditing(true);
    setActionError(null);
  }

  function cancelEditMode() {
    log.logUi("action:edit-cancel", { missionId: c!._id });
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
    log.logUi("action:accept", { missionId: Mission._id });
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
    log.logUi("action:drop-confirm", { missionId: Mission._id });
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
    log.logUi("action:delete-silently", { missionId: Mission._id });
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
    log.logUi("action:start", { missionId: Mission._id });
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
    setIsWorking(true);
    log.logUi("action:complete", { missionId: Mission._id });
    setActionError(null);
    try {
      await complete({ token, missionId: Mission._id });
      if (isMysteryMission) onMysteryMissionReveal?.();
      onClose();
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function handleCompleteAsStory() {
    if (!Mission || !onCompleteAsStory) return;
    log.logUi("action:complete-story", { missionId: Mission._id });
    onCompleteAsStory(Mission);
  }

  async function handleMarkInProgress() {
    setShowMarkInProgressConfirm(false);
    setIsWorking(true);
    log.logUi("action:start-confirmed", { missionId: c!._id });
    setActionError(null);
    try {
      await start({ token, missionId: c!._id });
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  function openStatusOverride() {
    setOverrideStatus(c!.status);
    setShowStatusOverride(true);
    log.logUi("action:status-override:open", { status: c!.status });
  }

  async function handleApplyStatusOverride() {
    if (overrideStatus === c!.status) {
      setShowStatusOverride(false);
      return;
    }
    setIsWorking(true);
    log.logUi("action:status-override", { missionId: c!._id, to: overrideStatus });
    setActionError(null);
    log.logMutation("Mission:status:override", { from: c!.status, to: overrideStatus });
    try {
      await updateStatus({ token, missionId: c!._id, newStatus: overrideStatus });
      log.logMutation("Mission:status:override:success");
      log.logState("MissionStatus", c!.status, overrideStatus);
      setShowStatusOverride(false);
    } catch (e) {
      log.error("Mission:status:override:error", "mutation", { message: String(e) });
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSetCurrentActivity() {
    setIsWorking(true);
    log.logUi("action:set-activity", { missionId: c!._id });
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
    log.logUi("action:toggle-pin", { missionId: Mission._id, hidden: !Mission.mapHidden });
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
    log.logUi("action:withdraw", { missionId: Mission._id });
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
      <div className={cn("flex flex-col gap-4 p-4 pt-0", isMysteryMission && "mystery-theme bg-[var(--bg-paper)]")}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--ink-1)]">Edit Mission</span>
          <button
            type="button"
            className="text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-1)]"
            onClick={cancelEditMode}
          >
            Cancel
          </button>
        </div>
        <p className={missionHintClass}>
          The follower will see the edits to the Mission.
        </p>

        <div className="flex flex-col gap-1">
          <label className={missionLabelClass}>Title</label>
          <Input
            placeholder="Mission title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={missionLabelClass}>Notes (optional)</label>
          <Textarea
            placeholder="Any details…"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={missionLabelClass}>Location label (optional)</label>
          <Input
            placeholder="Place name"
            value={editLocation}
            onChange={(e) => setEditLocation(e.target.value)}
            maxLength={200}
          />
          {onRequestCoordinatePick && (
            <LocationPickerField
              className="mt-1"
              lat={editLat}
              lon={editLon}
              onPick={handlePickEditCoordinates}
              onClear={() => { setEditLat(undefined); setEditLon(undefined); }}
            />
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className={missionLabelClass}>Est. cost (USD, optional)</label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={editCost}
              onChange={(e) => setEditCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className={missionLabelClass}>Est. duration (min, optional)</label>
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
          <label className={missionLabelClass}>Energy impact (optional)</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={cn(
                  energyChipBaseClass,
                  editEnergy === level
                    ? energyChipActiveClass
                    : energyChipIdleClass,
                )}
                onClick={() => setEditEnergy(editEnergy === level ? "" : level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <p className={missionErrorClass} role="alert">{actionError}</p>
        )}

        <p className="text-[11px] text-[var(--ink-3)]">
          Lifecycle changes (start, complete, drop, status) live in Next Steps —
          editing here only updates the Mission's details.
        </p>

        <Button
          size="sm"
          type="button"
          disabled={isWorking || !editTitle.trim()}
          onClick={handleSaveEdit}
        >
          {isWorking ? "Saving…" : "Save Changes"}
        </Button>

        <div className="mt-1 flex flex-col gap-3 border-t border-[var(--line-soft)] pt-3">
          <AttributionBlock
            token={token}
            viewerRole={role}
            sourceType="mission"
            sourceId={c._id}
          />

          {/* Award Badge — Traveler, completed Missions only (uses saved status) */}
          {isTraveler && status === "completed" && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              className="w-fit"
              onClick={() => {
                log.logUi("badge:award:open", { sourceType: "mission" });
                setAwardBadgeOpen(true);
              }}
            >
              🏅 Award Badge
            </Button>
          )}

          {isTraveler && (
            <AwardBadgeSheet
              open={awardBadgeOpen}
              token={token}
              sourceType="mission"
              sourceId={c._id}
              onOpenChange={setAwardBadgeOpen}
            />
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Normal detail view — split into Next Steps / About / Linked areas
  // ---------------------------------------------------------------------------

  const lifecycleActions = (
    <>
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
            {isMysteryMission ? "Start Mission" : <>Mark &lsquo;In Progress&rsquo;</>}
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
            <div className={dangerDividerClass} />
            <span className={dangerLabelClass}>⚠ Danger</span>
            <div className={dangerDividerClass} />
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={() => setShowDeleteConfirm(true)}
            className={dangerButtonClass}
          >
            Delete silently
          </Button>
        </>
      )}

      {showMarkInProgressConfirm && conflictingMission && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--amber)] bg-[color-mix(in_oklab,var(--amber)_14%,transparent)] p-3">
          <p className="text-sm text-[var(--ink-1)]">
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
            {isMysteryMission ? "Start Mission" : <>Mark &lsquo;In Progress&rsquo;</>}
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
            onClick={() => {
              log.logUi("action:drop-note-open", { missionId: c._id });
              setShowRejectForm(true);
            }}
          >
            Drop with note
          </Button>
          <div className="flex items-center gap-2 pt-1">
            <div className={dangerDividerClass} />
            <span className={dangerLabelClass}>⚠ Danger</span>
            <div className={dangerDividerClass} />
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={() => {
              log.logUi("action:delete-open", { missionId: c._id });
              setShowDeleteConfirm(true);
            }}
            className={dangerButtonClass}
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
          <p className={missionHintClass}>
            Completing this Mission will mark the linked Current Activity as done and open the Story form.
          </p>
          {onCompleteAsStory && (
            <Button
              size="sm"
              type="button"
              disabled={!canAct}
              onClick={handleCompleteAsStory}
              className="border-[var(--plum)] text-[var(--ink-on-brand)]"
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
            className="bg-[var(--teal)] hover:opacity-90 text-[var(--ink-on-brand)] border-[var(--teal)]"
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
            <div className={dangerDividerClass} />
            <span className={dangerLabelClass}>⚠ Danger</span>
            <div className={dangerDividerClass} />
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={() => setShowDeleteConfirm(true)}
            className={dangerButtonClass}
          >
            Delete silently
          </Button>
        </>
      )}

      {(status === "completed" || status === "dropped") && (
        <>
          <p className="text-sm text-[var(--ink-3)]">
            {status === "completed" ? "This Mission is complete." : "This Mission was dropped."}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className={dangerDividerClass} />
            <span className={dangerLabelClass}>⚠ Danger</span>
            <div className={dangerDividerClass} />
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={() => {
              log.logUi("action:delete-open", { missionId: c._id });
              setShowDeleteConfirm(true);
            }}
            className={cn(dangerButtonClass, "w-fit")}
          >
            Delete mission
          </Button>
        </>
      )}
    </>
  );

  const mysteryStateLabel =
    status === "completed" ? "Revealed"
      : status === "dropped" ? "Dismissed"
        : status === "in_progress" ? "Active"
          : "Unknown Signal";

  return (
    <div className={cn("flex flex-col gap-4 p-4 pt-0", isMysteryMission && "mystery-theme bg-[var(--bg-paper)]")}>
      {isMysteryMission ? (
        <>
          {/* Mystery hero — RadioTower chip + dark zinc card with CrypticText. */}
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-500/50 bg-zinc-950 px-3 py-1 font-[var(--font-mono)] text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-100">
              <RadioTower className="h-3.5 w-3.5" aria-hidden="true" />
              {mysteryStateLabel}
            </span>
          </div>
          <section className="grid gap-2 rounded-2xl border border-zinc-500/40 bg-zinc-950 p-4 text-zinc-100 shadow-[var(--shadow-card)]">
            <p className="font-[var(--font-display)] text-xl font-extrabold leading-tight">
              <CrypticText text={linkedMysteryMission?.mysteryText ?? c.title} />
            </p>
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              Blackbox itinerary fragment
            </p>
          </section>

          {linkedMysteryMission?.trueIntent ? (
            <section className="grid gap-2 rounded-xl border border-zinc-500/40 bg-[var(--bg-card)] p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                True Intent Revealed
              </p>
              {linkedMysteryMission.locationName ? (
                <p className="text-sm font-semibold text-[var(--ink-1)]">{linkedMysteryMission.locationName}</p>
              ) : null}
              <p className="text-sm leading-relaxed text-[var(--ink-1)]">{linkedMysteryMission.trueIntent}</p>
              {linkedMysteryMission.spoilerSummary ? (
                <p className="text-xs text-[var(--ink-3)]">{linkedMysteryMission.spoilerSummary}</p>
              ) : null}
            </section>
          ) : null}

          {linkedMysteryMission ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--ink-3)] empty:hidden">
              {linkedMysteryMission.region ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {linkedMysteryMission.region}
                </span>
              ) : null}
              {/* Backend only returns locationName after reveal — see mysteryMissions.ts publicMission(). */}
              {linkedMysteryMission.locationName ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {linkedMysteryMission.locationName}
                </span>
              ) : null}
              {linkedMysteryMission.tags?.slice(0, 4).map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          ) : null}

          {c.description && (
            <p className="text-sm text-[var(--ink-3)]">{c.description}</p>
          )}

          <ReactionSection
            targetId={c._id}
            targetType="mission"
            reactions={c.reactions}
            token={token}
          />
        </>
      ) : (
        <>
          {/* Header — status only; Edit lives in the About section so lifecycle
              actions and field edits stay visually separate. */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              {statusLabel(status, c.source)}
            </span>
          </div>

          {/* Title + description */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-[var(--ink-1)]">{c.title}</h2>
            {c.description && (
              <p className="text-sm text-[var(--ink-3)]">{c.description}</p>
            )}
          </div>

          <ReactionSection
            targetId={c._id}
            targetType="mission"
            reactions={c.reactions}
            token={token}
          />
        </>
      )}

      {/* ── Next Steps ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <SectionLabel>Next steps</SectionLabel>

        {/* Add a story — completed missions without a linked story yet */}
        {isTraveler && status === "completed" && onCompleteAsStory && !linkedStory && (
          <Button
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={handleCompleteAsStory}
            className="border-[var(--plum)] text-[var(--ink-on-brand)] w-fit"
            style={{ background: "var(--plum)" }}
          >
            Add a story
          </Button>
        )}

        {actionError && (
          <p className={missionErrorClass} role="alert">{actionError}</p>
        )}

        {/* Reject with response form */}
        {isTraveler && showRejectForm && (
          <div className="flex flex-col gap-3 border border-[var(--line-soft)] rounded-lg p-3 bg-[var(--bg-card)]">
            <div className="flex flex-wrap gap-2">
              {RESPONSE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    selectedPreset === preset
                      ? "bg-[var(--ink-1)] text-[var(--bg-paper)] border-[var(--ink-1)]"
                      : "bg-[var(--bg-paper)] text-[var(--ink-2)] border-[var(--line-soft)] hover:bg-[var(--meter-track)]"
                  )}
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
                className={primaryDangerButtonClass}
              >
                {isWorking ? "Dropping…" : "Confirm drop"}
              </Button>
            </div>
          </div>
        )}

        {/* Delete silently confirmation */}
        {isTraveler && showDeleteConfirm && (
          <div className="flex flex-col gap-3 border border-[var(--bg-danger)] rounded-lg p-3 bg-[var(--bg-danger)]">
            <p className="text-sm text-[var(--ink-danger)]">
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
                className={primaryDangerButtonClass}
              >
                {isWorking ? "Deleting…" : "Yes, delete"}
              </Button>
            </div>
          </div>
        )}

        {/* Traveler lifecycle actions (hidden while a confirm form is open) */}
        {isTraveler && !showRejectForm && !showDeleteConfirm && (
          <div className="flex flex-col gap-2">
            {lifecycleActions}

            {/* Manual status override — advanced, lifecycle-only control */}
            {showStatusOverride ? (
              <div className="mt-1 flex flex-col gap-2 rounded-lg border border-[var(--line-soft)] p-3">
                <label className={missionLabelClass}>Set status manually</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as MissionStatus)}
                  className={missionSelectClass}
                >
                  <option value="proposed">Proposed</option>
                  <option value="planned">Planned</option>
                  <option value="visible">Visible</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="dropped">Dropped</option>
                </select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setShowStatusOverride(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" type="button" disabled={!canAct} onClick={handleApplyStatusOverride}>
                    {isWorking ? "Saving…" : "Apply status"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="self-start text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-1)]"
                onClick={openStatusOverride}
              >
                Change status manually
              </button>
            )}
          </div>
        )}

        {/* Support follower: withdraw own proposed Mission */}
        {!isTraveler && isOwn && status === "proposed" && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!canAct}
            onClick={handleWithdraw}
            className={cn(dangerButtonClass, "w-fit")}
          >
            Withdraw proposal
          </Button>
        )}
      </section>

      {/* ── About ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 border-t border-[var(--line-soft)] pt-3">
        <div className="flex items-center justify-between">
          <SectionLabel>About</SectionLabel>
          {isTraveler && (
            <button
              type="button"
              className="text-xs text-[var(--flag)] underline hover:text-[var(--ink-1)]"
              onClick={openEditMode}
            >
              Edit
            </button>
          )}
        </div>

        {/* Meta */}
        {hasMeta && (
          <div className="flex flex-col gap-1 text-sm text-[var(--ink-3)]">
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
        )}

        {/* Traveler response (preset + note) — visible to both roles */}
        {(c.travelerResponsePreset || c.travelerResponseNote) && !c.silentDrop && (
          <div className="rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 flex flex-col gap-1.5">
            <p className={missionLabelClass}>Traveler's response</p>
            {c.travelerResponsePreset && (
              <span className="self-start rounded-full bg-[var(--meter-track)] px-2.5 py-0.5 text-xs font-medium text-[var(--flag)]">
                {c.travelerResponsePreset}
              </span>
            )}
            {c.travelerResponseNote && (
              <p className="text-sm text-[var(--ink-1)]">{c.travelerResponseNote}</p>
            )}
          </div>
        )}

        <AttributionBlock
          token={token}
          viewerRole={role}
          sourceType="mission"
          sourceId={c._id}
          editable={false}
        />

        {isTraveler && (
          <div className="border-t border-[var(--line-soft)] pt-3">
            <LinkedTransactionsSection
              token={token}
              mode="linked"
              target={{ type: "mission", id: c._id }}
            />
          </div>
        )}
      </section>

      {/* ── Linked ──────────────────────────────────────────────────── */}
      {(c.sourceRouteVoteId || c.linkedRouteVoteId || (isTraveler && linkedStory)) && (
        <section className="flex flex-col gap-2 border-t border-[var(--line-soft)] pt-3">
          <SectionLabel>Linked</SectionLabel>

          {/* Route vote source card — shown when mission originated from a vote */}
          {c.sourceRouteVoteId && (
            <RouteVoteSourceCard
              sourceVoteId={c.sourceRouteVoteId}
              sourceOptionId={c.sourceRouteVoteOptionId}
              token={token}
              onNavigate={onRequestNavigateToVote}
            />
          )}

          {/* Reciprocal link — this pre-existing mission won a later vote */}
          {c.linkedRouteVoteId && c.linkedRouteVoteId !== c.sourceRouteVoteId && (
            <RouteVoteSourceCard
              heading="Won Route Vote"
              sourceVoteId={c.linkedRouteVoteId}
              sourceOptionId={c.linkedRouteVoteOptionId}
              token={token}
              onNavigate={onRequestNavigateToVote}
            />
          )}

          {/* Linked story card — shown when a story has been filed against this mission */}
          {isTraveler && linkedStory && (
            <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wide">Linked story</p>
              <p className="text-sm font-medium text-[var(--ink-1)] line-clamp-1">{linkedStory.title ?? "Story"}</p>
              <p className="text-xs text-[var(--ink-3)]">
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
        </section>
      )}
      <MysteryMissionEditSheet
        open={mysteryEditOpen}
        token={token}
        mysteryMissionId={mysteryMissionId ?? null}
        onOpenChange={setMysteryEditOpen}
      />
    </div>
  );
}
