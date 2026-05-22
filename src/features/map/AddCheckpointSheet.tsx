import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import type { AddCheckpointArgs, CheckpointSource, TransactionInlineInput } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetGrabber,
  SheetKicker,
  SheetTitle,
} from "../../components/ui/sheet";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";

export type SelectedCoordinate = {
  lat: number;
  lon: number;
  source: CheckpointSource;
};

/**
 * Prefill payload for `AddCheckpointSheet`.
 *
 * `missionId` is forwarded straight into `addCheckpoint` so the row + its
 * journal event are linked to the mission atomically. The parent (TripMap)
 * also reads it back from `onCheckpointCreated` to fire
 * `travelerCompleteMission`, which is what flips the mission to
 * "completed" and closes the Vote → Mission → Story loop.
 */
export type CheckpointPrefill = {
  title?: string;
  note?: string;
  locationLabel?: string;
  missionId?: string;
  completeMission?: boolean;
  transaction?: TransactionInlineInput;
  /** Kicker label override — e.g. "Story · Mission completion" when prefilled from a mission. */
  kickerLabel?: string;
};

type AddCheckpointSheetProps = {
  selectedCoordinate: SelectedCoordinate | null;
  onSave: (args: Omit<AddCheckpointArgs, "token">) => Promise<string>;
  onClose: () => void;
  saveUnavailableMessage?: string;
  stateSection?: React.ReactNode;
  prefill?: CheckpointPrefill;
  onCheckpointCreated?: (id: string, prefill?: CheckpointPrefill) => void;
  /** When provided AND a story prefill is active (mission completion path),
   *  the action row swaps the "Cancel" button for a "← Back" button that the
   *  parent can wire to "reopen the mission detail" — matching the rest of the
   *  rework's internal-nav back affordance. Dismissal via swipe-down / escape
   *  still flows through `onClose` and just closes the sheet without
  *  navigating back to the mission. */
  onBack?: () => void;
  debugSource?: { source: string; sourceLabel: string };
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many checkpoints added too quickly. Try again in a minute.";
  }
  return message || "Unable to save checkpoint.";
}

export default function AddCheckpointSheet({
  selectedCoordinate,
  onSave,
  onClose,
  saveUnavailableMessage,
  stateSection,
  prefill,
  onCheckpointCreated,
  onBack,
  debugSource,
}: AddCheckpointSheetProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [showInStory, setShowInStory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const music = useMusicSafe();

  const log = useDebugLogger("AddCheckpointSheet", "src/features/map/AddCheckpointSheet.tsx");
  const isFromMission = Boolean(prefill?.missionId);
  const kicker = prefill?.kickerLabel ?? (isFromMission ? "Story · Mission completion" : "Story");
  const titleText = isFromMission ? "Complete as story" : "Add pin";
  const showBackAffordance = isFromMission && Boolean(onBack);
  useActiveUiContext(Boolean(selectedCoordinate), {
    sheetName: "AddCheckpointSheet",
    label: titleText,
    view: isFromMission ? "mission-completion" : "check-in",
    source: debugSource?.source ?? selectedCoordinate?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/map/AddCheckpointSheet.tsx",
  }, { boundsSelector: "[data-role='add-checkpoint-sheet']" });

  useEffect(() => {
    if (selectedCoordinate) {
      log.logInteraction("sheet:open", {
        source: selectedCoordinate.source,
        hasPrefill: Boolean(prefill),
        isFromMission,
      });
      performance.mark("tripcast:debug:addCheckpoint:open");
      setTitle(prefill?.title ?? "");
      setNote(prefill?.note ?? "");
      setLocationLabel(prefill?.locationLabel ?? "");
      // Mission completions always go to the Story feed — the whole point of the
      // "Complete as Story" branch is to land a narrative entry.
      setShowInStory(true);
      setError(null);
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoordinate, prefill]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCoordinate || isSaving) {
      return;
    }

    setError(null);
    if (saveUnavailableMessage) {
      setError(saveUnavailableMessage);
      return;
    }

    setIsSaving(true);
    log.logInteraction("form:submit", { isFromMission, showInStory, source: selectedCoordinate.source });

    try {
      const checkpointId = await onSave({
        title: title.trim() ? title : undefined,
        note: note.trim() ? note : undefined,
        locationLabel: locationLabel.trim() ? locationLabel : undefined,
        showInStory,
        lat: selectedCoordinate.lat,
        lon: selectedCoordinate.lon,
        source: selectedCoordinate.source,
        missionId: prefill?.missionId,
      });
      log.logInteraction("submit:success", { checkpointId });
      music.sfx("pin");
      onCheckpointCreated?.(checkpointId, prefill);
      onClose();
    } catch (saveError) {
      log.error("submit:error", "mutation", { message: saveError instanceof Error ? saveError.message : String(saveError) });
      setError(friendlyError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet
      open={selectedCoordinate !== null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className="z-[12] max-h-[85dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
        data-role="add-checkpoint-sheet"
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-4 pt-2">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetKicker dotColor={isFromMission ? "var(--plum)" : "var(--flag)"}>{kicker}</SheetKicker>
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              {titleText}
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close story form" />
        </div>

        <form
          className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Title <span className="font-normal text-[var(--ink-3)]">(optional)</span>
            <Input
              autoFocus
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              type="text"
              value={title}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Place name <span className="font-normal text-[var(--ink-3)]">(optional)</span>
            <Input
              maxLength={120}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. Capitol Hill"
              type="text"
              value={locationLabel}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            {isFromMission ? "How did the mission go?" : "Story / Notes"}
            <Textarea
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isFromMission ? "Tell the follower what happened…" : undefined}
              rows={isFromMission ? 5 : 3}
              value={note}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
            <input
              type="checkbox"
              checked={showInStory}
              onChange={(e) => setShowInStory(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: "var(--flag)" }}
              disabled={isFromMission}
            />
            Add to Story
            {isFromMission ? (
              <span className="font-normal text-[var(--ink-3)]">(required for mission completion)</span>
            ) : null}
          </label>
          <div
            className="grid gap-1 rounded-xl px-3 py-2 font-[var(--font-mono)] text-[11px] text-[var(--ink-2)]"
            style={{ background: "var(--bg-paper-2)" }}
          >
            <span>LAT {formatCoordinate(selectedCoordinate?.lat ?? 0)}</span>
            <span>LON {formatCoordinate(selectedCoordinate?.lon ?? 0)}</span>
          </div>
          {stateSection}
          {error ? (
            <p
              role="alert"
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)",
                background: "color-mix(in oklab, var(--danger) 10%, transparent)",
                color: "var(--danger)",
              }}
            >
              {error}
            </p>
          ) : null}
          <div
            className="flex flex-wrap justify-end gap-2 pt-1"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {showBackAffordance ? (
              <Button
                disabled={isSaving}
                type="button"
                variant="outline"
                onClick={onBack}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            ) : (
              <Button disabled={isSaving} type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : isFromMission ? "Save story" : "Save pin"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
