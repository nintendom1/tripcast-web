import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Camera } from "lucide-react";
import { X } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { StatBar } from "../../components/rpg/StatBar";

import { tripcastApi } from "../../convex/tripcastApi";
import type { JournalEvent, Role } from "../../convex/tripcastApi";
import { log } from "../../debug/debugLogger";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetHeader,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
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
      <span className="text-muted-foreground">{label}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{value}</span>
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
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
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
        <span className="font-medium text-muted-foreground">Stomach</span>
        <span className="font-semibold">{label}</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 bg-orange-500" style={{ width: `${normalFillPct}%` }} />
        {overflowFillPct > 0 && (
          <div className="absolute inset-y-0 bg-amber-700" style={{ left: `${markerPct}%`, width: `${overflowFillPct}%` }} />
        )}
        <div className="absolute inset-y-0 w-px bg-background/60" style={{ left: `${markerPct}%` }} />
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
  debugSource,
}: StoryDetailSheetProps) {
  const isNarrative = event?.narrativeLevel === "narrative";
  // `isEditing` lives here (not in NarrativeBody) so the active UI context can
  // reflect the edit sub-view in the debug log. Reset whenever the open story
  // changes or the sheet closes so a new story never opens mid-edit.
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    setIsEditing(false);
  }, [event?._id]);

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
      log("info", "StoryDetailSheet", "sheet:open", "ui", {
        checkpointId: event.checkpointId,
        narrativeLevel: event.narrativeLevel,
      });
    }
  }, [event]);

  useEffect(() => {
    if (event?.lat !== undefined && event?.lon !== undefined) {
      onLocationFocus({ lat: event.lat, lon: event.lon });
    }
    // Focus map when story opens; onLocationFocus is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?._id]);

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
        className={
          isNarrative
            ? "z-[11] max-h-[78dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
            : "z-[11] shadow-2xl max-h-[50dvh]"
        }
        data-role="story-detail"
      >
        {isNarrative ? <SheetGrabber /> : null}
        {event ? (
          isNarrative ? (
            <NarrativeBody
              key={event._id}
              event={event}
              token={token}
              role={role}
              onClose={onClose}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              missionTitle={missionTitle}
              missionId={missionId}
              onNavigateToMission={onNavigateToMission}
            />
          ) : (
            <ActivityBody key={event._id} event={event} onClose={onClose} />
          )
        ) : null}
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

function NarrativeBody({
  event,
  token,
  role,
  onClose,
  isEditing,
  setIsEditing,
  missionTitle,
  missionId,
  onNavigateToMission,
}: {
  event: JournalEvent;
  token?: string;
  role?: Role;
  onClose: () => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  missionTitle?: string;
  missionId?: string;
  onNavigateToMission?: (id: string) => void;
}) {
  const music = useMusicSafe();
  const updateCheckpoint = useMutation(tripcastApi.checkpoints.updateCheckpoint);
  const deleteCheckpoint = useMutation(tripcastApi.checkpoints.deleteCheckpoint);

  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editShowInStory, setEditShowInStory] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isTraveler = role === "traveler";
  const canEdit = isTraveler && Boolean(token) && Boolean(event.checkpointId);

  function openEditMode() {
    log("info", "StoryDetailSheet", "form:open", "ui", { checkpointId: event.checkpointId });
    setEditTitle(event.title ?? "");
    setEditBody(event.body ?? "");
    setEditLocation(event.locationLabel ?? "");
    // A narrative story shown in this sheet is, by definition, in the Story.
    setEditShowInStory(event.narrativeLevel !== "activity");
    setActionError(null);
    setIsEditing(true);
  }

  function cancelEditMode() {
    log("info", "StoryDetailSheet", "form:cancel", "ui", {});
    setIsEditing(false);
    setActionError(null);
  }

  async function handleSaveEdit() {
    if (!token || !event.checkpointId || isWorking) return;
    setIsWorking(true);
    setActionError(null);
    log("info", "StoryDetailSheet", "form:submit", "mutation", { checkpointId: event.checkpointId });
    try {
      await updateCheckpoint({
        token,
        checkpointId: event.checkpointId,
        title: editTitle.trim() ? editTitle : undefined,
        note: editBody.trim() ? editBody : undefined,
        locationLabel: editLocation.trim() ? editLocation : undefined,
        showInStory: editShowInStory,
      });
      music.sfx("success");
      log("info", "StoryDetailSheet", "form:submit:success", "mutation", {});
      setIsEditing(false);
    } catch (e) {
      log("error", "StoryDetailSheet", "form:submit:error", "mutation", { message: String(e) });
      setActionError(friendlyError(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleConfirmDelete() {
    if (!token || !event.checkpointId) {
      setPendingDelete(false);
      return;
    }
    setIsDeleting(true);
    log("info", "StoryDetailSheet", "delete:confirm", "mutation", { checkpointId: event.checkpointId });
    try {
      await deleteCheckpoint({ token, checkpointId: event.checkpointId });
      music.sfx("success");
      log("info", "StoryDetailSheet", "delete:success", "mutation", {});
      setPendingDelete(false);
      onClose();
    } catch (e) {
      // Leave the sheet open; the data subscription refreshes if it landed.
      log("error", "StoryDetailSheet", "delete:error", "mutation", { message: String(e) });
      setPendingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2 px-5 pt-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SheetKicker dotColor="var(--amber)">
            <Camera className="h-3 w-3" aria-hidden="true" />
            Story · {formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}
          </SheetKicker>
          <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold leading-tight tracking-tight text-[var(--ink-1)]">
            {event.title ?? "Story"}
          </SheetTitle>
          {event.locationLabel ? (
            <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {event.locationLabel}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canEdit && !isEditing ? (
            <button
              type="button"
              className="text-xs text-navy underline"
              onClick={openEditMode}
            >
              Edit
            </button>
          ) : null}
          <SheetCloseButton aria-label="Close story" />
        </div>
      </div>

      <SheetBody
        className="px-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {isEditing ? (
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--ink-1)]">Edit Story</span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={cancelEditMode}
              >
                Cancel
              </button>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
              Title <span className="font-normal text-[var(--ink-3)]">(optional)</span>
              <Input
                maxLength={120}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                type="text"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
              Place name <span className="font-normal text-[var(--ink-3)]">(optional)</span>
              <Input
                maxLength={120}
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Capitol Hill"
                type="text"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
              Story / Notes
              <Textarea
                maxLength={1000}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
              <input
                type="checkbox"
                checked={editShowInStory}
                onChange={(e) => setEditShowInStory(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: "var(--flag)" }}
              />
              Add to Story
            </label>

            {actionError ? (
              <p
                role="alert"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)",
                  background: "color-mix(in oklab, var(--danger) 10%, transparent)",
                  color: "var(--danger)",
                }}
              >
                {actionError}
              </p>
            ) : null}

            <Button type="button" disabled={isWorking} onClick={handleSaveEdit}>
              {isWorking ? "Saving…" : "Save changes"}
            </Button>

            {token && event.checkpointId ? (
              <div className="mt-1 border-t border-[var(--line-soft)] pt-3">
                <AttributionBlock
                  token={token}
                  viewerRole={role!}
                  sourceType="story"
                  sourceId={event.checkpointId}
                />
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      log("info", "StoryDetailSheet", "badge:award:open", "ui", {
                        sourceType: "story",
                      });
                      setAwardBadgeOpen(true);
                    }}
                  >
                    🏅 Award Badge
                  </Button>
                  <AwardBadgeSheet
                    open={awardBadgeOpen}
                    token={token}
                    sourceType="story"
                    sourceId={event.checkpointId}
                    onOpenChange={setAwardBadgeOpen}
                  />
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    className="text-sm font-semibold text-[var(--danger)] underline"
                    onClick={() => setPendingDelete(true)}
                  >
                    Delete Story
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
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
                <AttributionBlock
                  token={token}
                  viewerRole={role}
                  sourceType="story"
                  sourceId={event.checkpointId}
                  editable={false}
                />
              </div>
            ) : null}

            {missionId && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mission</p>
                <p className="text-sm font-medium text-[var(--ink-1)] line-clamp-1">{missionTitle ?? "View mission"}</p>
                {onNavigateToMission && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigateToMission(missionId)}
                    className="self-start mt-1"
                  >
                    Open mission
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </SheetBody>

      <ConfirmDelete
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(false);
        }}
        title="Delete this Story?"
        itemLabel={event.title ?? undefined}
        description="The pin disappears from the map and the journal. Linked transactions are kept but unlinked. This can't be undone."
        onConfirm={handleConfirmDelete}
        pending={isDeleting}
      />
    </>
  );
}

function ActivityBody({
  event,
  onClose,
}: {
  event: JournalEvent;
  onClose: () => void;
}) {
  const hasState =
    event.moodValue !== undefined ||
    event.energyLevel !== undefined ||
    event.stomachLevel !== undefined ||
    event.stressLevel !== undefined ||
    event.schedulePressureLevel !== undefined ||
    event.statusNote !== undefined;

  return (
    <>
      <SheetHeader className="flex-row items-center justify-between space-y-0 border-b pb-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-xs text-muted-foreground">
            {formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}
          </p>
          <SheetTitle className="text-base font-bold text-navy truncate">
            {event.title ?? "Story"}
          </SheetTitle>
          {event.locationLabel && (
            <p className="text-xs text-muted-foreground">{event.locationLabel}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          className="ml-3 shrink-0 rounded-md p-1.5 hover:bg-muted transition-colors"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </SheetHeader>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {event.body && (
          <p className="text-sm text-foreground whitespace-pre-wrap">{event.body}</p>
        )}

        {hasState && (
          <div className="rounded-md border bg-muted/20 px-3 py-3 grid gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              State at this story
            </p>

            {event.moodValue && (
              <StatChip
                label="Mood"
                value={MOOD_LABELS[event.moodValue as keyof typeof MOOD_LABELS] ?? event.moodValue}
              />
            )}

            {event.energyLevel && (
              <StatBarRow
                label="Energy"
                value={ENERGY_LABELS[event.energyLevel as keyof typeof ENERGY_LABELS] ?? event.energyLevel}
                score={ENERGY_SCORE_FOR_LEVEL[event.energyLevel as keyof typeof ENERGY_SCORE_FOR_LEVEL] ?? 50}
                colorClass="bg-amber-500"
              />
            )}

            {event.stomachLevel && <StomachBarRow level={event.stomachLevel} />}

            {event.stressLevel && (
              <StatBarRow
                label="Stress"
                value={STRESS_LABELS[event.stressLevel as keyof typeof STRESS_LABELS] ?? event.stressLevel}
                score={STRESS_SCORE_FOR_LEVEL[event.stressLevel as keyof typeof STRESS_SCORE_FOR_LEVEL] ?? 50}
                colorClass="bg-red-500"
              />
            )}

            {event.schedulePressureLevel && (
              <StatChip
                label="Schedule"
                value={SCHEDULE_LABELS[event.schedulePressureLevel as keyof typeof SCHEDULE_LABELS] ?? event.schedulePressureLevel}
              />
            )}

            {event.statusNote && (
              <p className="text-xs italic text-muted-foreground">&ldquo;{event.statusNote}&rdquo;</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
