import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { StatBar } from "../../components/rpg/StatBar";

import { tripcastApi } from "../../convex/tripcastApi";
import type { JournalEvent, Role } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGradientHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { cn } from "@/lib/utils";
import { LocationPickerField } from "../map/MapPicker";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { RevealText } from "../../components/ui/RevealText";
import { useMusicSafe } from "../../providers/MusicProvider";
import AttributionBlock from "../attributions/AttributionBlock";
import AwardBadgeSheet from "../achievements/AwardBadgeSheet";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import {
  MOOD_LABELS,
  ENERGY_LABELS,
  STOMACH_LABELS,
  STRESS_LABELS,
  SCHEDULE_LABELS,
  ENERGY_SCORE_FOR_LEVEL,
  STRESS_SCORE_FOR_LEVEL,
  STOMACH_SCORE_FOR_LEVEL,
} from "../travelstate/travelerStateUtils";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--ink-3)]">{label}</span>
      <span className="rounded-full bg-[var(--bg-paper)] border border-[var(--line-soft)] px-2 py-0.5 font-medium text-[var(--ink-1)]">{value}</span>
    </div>
  );
}

function StatBarRow({
  label,
  value,
  score,
  maxScore = 100,
  colorClass,
}: {
  label: string;
  value: string;
  score: number;
  maxScore?: number;
  colorClass: string;
}) {
  const pct = Math.round((score / maxScore) * 100);
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--ink-3)]">{label}</span>
        <span className="font-semibold text-[var(--ink-1)]">{value}</span>
      </div>
      <StatBar value={pct} label="" colorClass={colorClass} />
    </div>
  );
}

function StomachBarRow({ level }: { level: string }) {
  const score = STOMACH_SCORE_FOR_LEVEL[level as keyof typeof STOMACH_SCORE_FOR_LEVEL] ?? 0;
  const label = STOMACH_LABELS[level as keyof typeof STOMACH_LABELS] ?? level;
  const maxScore = 150;
  const markerPct = (100 / 150) * 100;
  const totalFillPct = (score / maxScore) * 100;
  const normalFillPct = Math.min(totalFillPct, markerPct);
  const overflowFillPct = Math.max(0, totalFillPct - markerPct);

  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--ink-3)]">Stomach</span>
        <span className="font-semibold text-[var(--ink-1)]">{label}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-paper)] border border-[var(--line-soft)]">
        <div className="absolute inset-y-0 left-0 bg-[var(--flag)]" style={{ width: `${normalFillPct}%` }} />
        {overflowFillPct > 0 && (
          <div className="absolute inset-y-0 bg-[var(--amber)]" style={{ left: `${markerPct}%`, width: `${overflowFillPct}%` }} />
        )}
        <div className="absolute inset-y-0 w-px bg-[var(--bg-paper)]/60" style={{ left: `${markerPct}%` }} />
      </div>
    </div>
  );
}

type StoryDetailSheetProps = {
  event: JournalEvent | null;
  token?: string;
  role?: Role;
  onClose: () => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
  /** Title of the mission the story was filed against, when `event.missionId`
   *  is set. Parent resolves this from the mission list. */
  missionTitle?: string;
  missionId?: string;
  onNavigateToMission?: (id: string) => void;
  /** Enter map coordinate-pick mode; receives a callback invoked with the picked coord. */
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  /** True while a map coordinate pick is in progress — hides the sheet so the map is tappable. */
  isPickingCoordinate?: boolean;
  navigation?: {
    currentIndex: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
  } | null;
  onNavigateStory?: (direction: "previous" | "next") => void;
  debugSource?: { source: string; sourceLabel: string };
};

export default function StoryDetailSheet({
  event,
  token,
  role,
  onClose,
  onLocationFocus,
  missionTitle,
  missionId,
  onNavigateToMission,
  onRequestCoordinatePick,
  isPickingCoordinate,
  navigation,
  onNavigateStory,
  debugSource,
}: StoryDetailSheetProps) {
  const { journal: journalPersonality } = useSheetPersonalities();
  const log = useDebugLogger("StoryDetailSheet", "src/features/journal/StoryDetailSheet.tsx");
  const music = useMusicSafe();
  const updateCheckpoint = useMutation(tripcastApi.checkpoints.updateCheckpoint);
  const deleteCheckpoint = useMutation(tripcastApi.checkpoints.deleteCheckpoint);

  const [isEditing, setIsEditing] = useState(false);
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLat, setEditLat] = useState<number | undefined>(undefined);
  const [editLon, setEditLon] = useState<number | undefined>(undefined);
  const [editShowInStory, setEditShowInStory] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [optimisticEvent, setOptimisticEvent] = useState<JournalEvent | null>(null);

  const displayEvent = optimisticEvent?._id === event?._id ? optimisticEvent : event;
  const isNarrative = displayEvent?.narrativeLevel === "narrative";

  const isTraveler = role === "traveler";
  const canEdit = isTraveler && Boolean(token) && Boolean(displayEvent?.checkpointId);

  useEffect(() => {
    setIsEditing(false);
    setAwardBadgeOpen(false);
    setPendingDelete(false);
    setActionError(null);
    setOptimisticEvent(null);
  }, [event?._id]);

  useEffect(() => {
    if (!event) {
      setOptimisticEvent(null);
      return;
    }
    setOptimisticEvent((current) => {
      if (!current || current._id !== event._id) return current;
      const parentCaughtUp =
        current.title === event.title &&
        current.body === event.body &&
        current.locationLabel === event.locationLabel &&
        current.lat === event.lat &&
        current.lon === event.lon &&
        current.narrativeLevel === event.narrativeLevel;
      return parentCaughtUp ? null : current;
    });
  }, [event]);

  function openEditMode() {
    if (!displayEvent) return;
    log.logInteraction("form:open", { checkpointId: displayEvent.checkpointId });
    setEditTitle(displayEvent.title ?? "");
    setEditBody(displayEvent.body ?? "");
    setEditLocation(displayEvent.locationLabel ?? "");
    setEditLat(displayEvent.lat);
    setEditLon(displayEvent.lon);
    setEditShowInStory(displayEvent.narrativeLevel !== "activity");
    setActionError(null);
    setIsEditing(true);
  }

  function cancelEditMode() {
    log.logInteraction("form:cancel", {});
    setIsEditing(false);
    setActionError(null);
  }

  function handleStoryNavigation(direction: "previous" | "next") {
    const canNavigate =
      direction === "previous" ? navigation?.hasPrevious === true : navigation?.hasNext === true;
    if (!canNavigate) {
      log.logInteraction("story:navigate:boundary", {
        direction,
        currentIndex: navigation?.currentIndex,
        total: navigation?.total,
      });
      return;
    }
    log.logInteraction("story:navigate:click", {
      direction,
      currentIndex: navigation?.currentIndex,
      total: navigation?.total,
    });
    onNavigateStory?.(direction);
  }

  async function handleSaveEdit() {
    if (!token || !event?.checkpointId || isWorking) return;
    setIsWorking(true);
    setActionError(null);
    log.logInteraction("form:submit", { checkpointId: event.checkpointId });
    try {
      await updateCheckpoint({
        token,
        checkpointId: event.checkpointId,
        title: editTitle.trim() ? editTitle : undefined,
        note: editBody.trim() ? editBody : undefined,
        locationLabel: editLocation.trim() ? editLocation : undefined,
        lat: editLat,
        lon: editLon,
        showInStory: editShowInStory,
      });
      music.sfx("success");
      log.logInteraction("form:submit:success", {});
      setOptimisticEvent({
        ...event,
        title: editTitle.trim() ? editTitle : undefined,
        body: editBody.trim() ? editBody : undefined,
        locationLabel: editLocation.trim() ? editLocation : undefined,
        lat: editLat,
        lon: editLon,
        narrativeLevel: editShowInStory ? "narrative" : "activity",
      });
      setIsEditing(false);
    } catch (e) {
      log.logInteraction("form:submit:error", { message: String(e) });
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleConfirmDelete() {
    if (!token || !event?.checkpointId) {
      setPendingDelete(false);
      return;
    }
    setIsDeleting(true);
    log.logInteraction("delete:confirm", { checkpointId: event.checkpointId });
    try {
      await deleteCheckpoint({ token, checkpointId: event.checkpointId });
      music.sfx("success");
      log.logInteraction("delete:success", {});
      setPendingDelete(false);
      onClose();
    } catch (e) {
      log.logInteraction("delete:error", { message: String(e) });
      setPendingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  useActiveUiContext(Boolean(event), {
    sheetName: "StoryDetailSheet",
    label: isNarrative ? "Story detail" : "Activity detail",
    view: isNarrative ? (isEditing ? "narrative:edit" : "narrative") : "activity",
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/journal/StoryDetailSheet.tsx",
  }, { boundsSelector: "[data-role='story-detail']" });

  useEffect(() => {
    if (event) {
      log.logInteraction("sheet:open", {
        checkpointId: event.checkpointId,
        narrativeLevel: event.narrativeLevel,
      });
    }
  }, [event, log]);

  useEffect(() => {
    if (event?.lat !== undefined && event?.lon !== undefined) {
      onLocationFocus({ lat: event.lat, lon: event.lon });
    }
    // Focus map when story opens; onLocationFocus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?._id, event?.lat, event?.lon]);

  return (
    <Sheet
      open={Boolean(event)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className={cn("z-[11] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]", isPickingCoordinate && "invisible pointer-events-none")}
        data-role="story-detail"
      >
        {displayEvent && (
          <>
            <SheetGradientHeader color={journalPersonality.color} bg={journalPersonality.bg}>
              <div className="flex min-w-0 flex-col gap-1.5">
                <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold leading-tight tracking-tight text-[var(--ink-1)]">
                  {displayEvent.title ?? (isNarrative ? "Story" : "Check In")}
                </SheetTitle>
                <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {formatDate(displayEvent.occurredAt)} · {formatTime(displayEvent.occurredAt)}
                </p>
                {displayEvent.locationLabel ? (
                  <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {displayEvent.locationLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {navigation && navigation.total > 1 ? (
                  <div className="flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-1 py-0.5 shadow-sm">
                    <button
                      type="button"
                      aria-label="Previous story"
                      aria-disabled={!navigation.hasPrevious}
                      onClick={() => handleStoryNavigation("previous")}
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]",
                        !navigation.hasPrevious && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[var(--ink-2)]",
                      )}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="min-w-8 text-center font-[var(--font-mono)] text-[10px] font-semibold text-[var(--ink-3)]">
                      {navigation.currentIndex + 1}/{navigation.total}
                    </span>
                    <button
                      type="button"
                      aria-label="Next story"
                      aria-disabled={!navigation.hasNext}
                      onClick={() => handleStoryNavigation("next")}
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--meter-track)] hover:text-[var(--ink-1)]",
                        !navigation.hasNext && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[var(--ink-2)]",
                      )}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {canEdit && !isEditing ? (
                  <button type="button" className="text-xs text-[var(--flag)] underline hover:text-[var(--ink-1)]" onClick={openEditMode}>
                    Edit
                  </button>
                ) : null}
                <SheetCloseButton aria-label="Close" />
              </div>
            </SheetGradientHeader>

            <SheetBody className="px-5" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
              {isEditing ? (
                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--ink-1)]">Edit {isNarrative ? "Story" : "Check In"}</span>
                    <button type="button" className="text-xs text-[var(--ink-3)] underline hover:text-[var(--ink-1)]" onClick={cancelEditMode}>
                      Cancel
                    </button>
                  </div>

                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                    Title <span className="font-normal text-[var(--ink-3)]">(optional)</span>
                    <Input maxLength={120} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} type="text" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                    Place name <span className="font-normal text-[var(--ink-3)]">(optional)</span>
                    <Input maxLength={120} value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Capitol Hill" type="text" />
                  </label>
                  {onRequestCoordinatePick && (
                    <LocationPickerField
                      lat={editLat}
                      lon={editLon}
                      onPick={() => {
                        log.logInteraction("coordinate:pick-mode:request", { checkpointId: displayEvent.checkpointId });
                        onRequestCoordinatePick((coord) => {
                          setEditLat(coord.lat);
                          setEditLon(coord.lon);
                        });
                      }}
                      onClear={() => {
                        setEditLat(undefined);
                        setEditLon(undefined);
                      }}
                    />
                  )}
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                    Story / Notes
                    <Textarea maxLength={1000} value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={5} />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
                    <input
                      type="checkbox"
                      checked={editShowInStory}
                      onChange={(e) => setEditShowInStory(e.target.checked)}
                      className="h-4 w-4"
                      style={{ accentColor: "var(--flag)" }}
                    />
                    Add as a story
                  </label>

                  {actionError ? (
                    <p
                      role="alert"
                      className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]"
                    >
                      {actionError}
                    </p>
                  ) : null}

                  <Button type="button" disabled={isWorking} onClick={handleSaveEdit}>
                    {isWorking ? "Saving…" : "Save changes"}
                  </Button>

                  {token && displayEvent.checkpointId ? (
                    <div className="mt-1 border-t border-[var(--line-soft)] pt-3">
                      <AttributionBlock token={token} viewerRole={role!} sourceType="story" sourceId={displayEvent.checkpointId} />
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            log.logInteraction("badge:award:open", { sourceType: "story" });
                            setAwardBadgeOpen(true);
                          }}
                        >
                          🏅 Award Badge
                        </Button>
                        <AwardBadgeSheet open={awardBadgeOpen} token={token} sourceType="story" sourceId={displayEvent.checkpointId} onOpenChange={setAwardBadgeOpen} />
                      </div>
                      <div className="mt-3">
                        <button type="button" className="text-sm font-semibold text-[var(--ink-danger)] underline hover:text-[var(--ink-1)]" onClick={() => setPendingDelete(true)}>
                          Delete {isNarrative ? "Story" : "Check In"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : isNarrative ? (
                <NarrativeContent event={displayEvent} token={token} role={role} missionTitle={missionTitle} missionId={missionId} onNavigateToMission={onNavigateToMission} />
              ) : (
                <ActivityContent event={displayEvent} />
              )}
            </SheetBody>

            <ConfirmDelete
              open={pendingDelete}
              onOpenChange={(open) => {
                if (!open) setPendingDelete(false);
              }}
              title={`Delete this ${isNarrative ? "Story" : "Check In"}?`}
              itemLabel={displayEvent.title ?? undefined}
              description="The pin disappears from the map and the journal. Linked transactions are kept but unlinked. This can't be undone."
              onConfirm={handleConfirmDelete}
              pending={isDeleting}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many edits in a short window. Try again in a minute.";
  }
  if (message.toLowerCase().includes("not found")) {
    return "This Story no longer exists.";
  }
  return message || "Unable to save changes.";
}

function NarrativeContent({
  event,
  token,
  role,
  missionTitle,
  missionId,
  onNavigateToMission,
}: {
  event: JournalEvent;
  token?: string;
  role?: Role;
  missionTitle?: string;
  missionId?: string;
  onNavigateToMission?: (id: string) => void;
}) {
  return (
    <>
      {event.body ? (
        <RevealText
          text={event.body}
          className="block font-[var(--font-display)] text-[15px] leading-relaxed text-[var(--ink-1)]"
        />
      ) : (
        <p className="text-sm italic text-[var(--ink-3)]">No story body yet.</p>
      )}

      {event.statusNote ? (
        <blockquote className="mt-5 border-l-2 border-[var(--amber)] pl-4 text-sm italic text-[var(--ink-2)]">
          &ldquo;{event.statusNote}&rdquo;
        </blockquote>
      ) : null}

      {event.checkpointId && token && role ? (
        <div className="mt-4">
          <AttributionBlock token={token} viewerRole={role} sourceType="story" sourceId={event.checkpointId} editable={false} />
        </div>
      ) : null}

      {missionId && (
        <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 flex flex-col gap-1 shadow-sm">
          <p className="text-[10px] font-bold text-[var(--ink-3)] uppercase tracking-[0.1em]">Mission</p>
          <p className="text-sm font-bold text-[var(--ink-1)] line-clamp-1">{missionTitle ?? "View mission"}</p>
          {onNavigateToMission && (
            <Button size="sm" variant="outline" onClick={() => onNavigateToMission(missionId)} className="self-start mt-2">
              Open mission
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function ActivityContent({ event }: { event: JournalEvent }) {
  const hasState =
    event.moodValue !== undefined ||
    event.energyLevel !== undefined ||
    event.stomachLevel !== undefined ||
    event.stressLevel !== undefined ||
    event.schedulePressureLevel !== undefined ||
    event.statusNote !== undefined;

  return (
    <div className="flex flex-col gap-4">
      {event.body && (
        <RevealText
          text={event.body}
          className="block font-[var(--font-display)] text-[15px] leading-relaxed text-[var(--ink-1)]"
        />
      )}

      {hasState && (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-3 grid gap-2 shadow-sm">
          <p className="text-[10px] font-bold text-[var(--ink-3)] uppercase tracking-[0.1em]">State at this check in</p>

          {event.moodValue && <StatChip label="Mood" value={MOOD_LABELS[event.moodValue as keyof typeof MOOD_LABELS] ?? event.moodValue} />}

          {event.energyLevel && (
            <StatBarRow
              label="Energy"
              value={ENERGY_LABELS[event.energyLevel as keyof typeof ENERGY_LABELS] ?? event.energyLevel}
              score={ENERGY_SCORE_FOR_LEVEL[event.energyLevel as keyof typeof ENERGY_SCORE_FOR_LEVEL] ?? 50}
              colorClass="bg-[var(--amber)]"
            />
          )}

          {event.stomachLevel && <StomachBarRow level={event.stomachLevel} />}

          {event.stressLevel && (
            <StatBarRow
              label="Stress"
              value={STRESS_LABELS[event.stressLevel as keyof typeof STRESS_LABELS] ?? event.stressLevel}
              score={STRESS_SCORE_FOR_LEVEL[event.stressLevel as keyof typeof STRESS_SCORE_FOR_LEVEL] ?? 50}
              colorClass="bg-[var(--plum)]"
            />
          )}

          {event.schedulePressureLevel && <StatChip label="Schedule" value={SCHEDULE_LABELS[event.schedulePressureLevel as keyof typeof SCHEDULE_LABELS] ?? event.schedulePressureLevel} />}

          {event.statusNote && <p className="text-xs italic text-[var(--ink-2)]">&ldquo;{event.statusNote}&rdquo;</p>}
        </div>
      )}
    </div>
  );
}
