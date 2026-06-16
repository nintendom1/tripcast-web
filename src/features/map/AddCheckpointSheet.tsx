import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ImagePlus, Trash2 } from "lucide-react";

import type { AddCheckpointArgs, CheckpointSource, StoryImageSize } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { validateStoryImageFile } from "../journal/storyImageUpload";

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
  mysteryReveal?: boolean;
};

type AddCheckpointSheetProps = {
  selectedCoordinate: SelectedCoordinate | null;
  onSave: (args: Omit<AddCheckpointArgs, "token">, file?: File) => void;
  onClose: () => void;
  saveUnavailableMessage?: string;
  stateSection?: React.ReactNode;
  prefill?: CheckpointPrefill;
  onCheckpointCreated?: (id: string, prefill?: CheckpointPrefill) => void;
  prefillFile?: File;
  /** When provided AND a story prefill is active (mission completion path),
   *  the action row swaps the "Cancel" button for a "← Back" button that the
   *  parent can wire to "reopen the mission detail" — matching the rest of the
   *  rework's internal-nav back affordance. Dismissal via swipe-down / escape
   *  still flows through `onClose` and just closes the sheet without
  *  navigating back to the mission. */
  onBack?: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  debugSource?: { source: string; sourceLabel: string };
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

// Render a Date as a value the native `datetime-local` input understands.
// We work in the user's local zone in the UI and convert to UTC epoch ms on
// save — the schema column stores UTC.
function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    "T" + pad(date.getHours()) +
    ":" + pad(date.getMinutes())
  );
}

function parseLocalDatetimeInputValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const FUTURE_WARNING_MS = 24 * 60 * 60 * 1000;
const STORY_IMAGE_SIZES = ["compact", "medium", "large"] as const;

function getDefaultStoryImageSize(): StoryImageSize {
  return typeof window !== "undefined" && window.innerWidth < 640 ? "compact" : "medium";
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("too many") || message.toLowerCase().includes("rate")) {
    return "Too many checkpoints added too quickly. Try again in a minute.";
  }
  return message || "Unable to save checkpoint.";
}

export default function AddCheckpointSheet(props: AddCheckpointSheetProps) {
  const {
    selectedCoordinate,
    onSave,
    onClose,
    saveUnavailableMessage,
    stateSection,
    prefill,
    onCheckpointCreated,
    onBack,
    onUploadImage,
    debugSource,
  } = props;
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [showInStory, setShowInStory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<StoryImageSize>(() => getDefaultStoryImageSize());
  const [happenedAtInput, setHappenedAtInput] = useState<string>(() =>
    toLocalDatetimeInputValue(new Date()),
  );
  const music = useMusicSafe();

  const log = useDebugLogger("AddCheckpointSheet", "src/features/map/AddCheckpointSheet.tsx");
  const isFromMission = Boolean(prefill?.missionId);
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
    if (!selectedCoordinate) {
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }
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

    if (props.prefillFile) {
      setImageFile(props.prefillFile);
      setImagePreviewUrl(URL.createObjectURL(props.prefillFile));
    } else {
      setImageFile(null);
      setImagePreviewUrl(null);
    }

    setImageSize(getDefaultStoryImageSize());
    setHappenedAtInput(toLocalDatetimeInputValue(new Date()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoordinate, prefill, props.prefillFile]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  function handleImageChange(file: File | undefined) {
    if (!file) return;
    try {
      validateStoryImageFile(file);
      setImageFile(file);
      setImagePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setError(null);
      log.logInteraction("story-image:attach", {
        bytes: file.size,
        contentType: file.type || "unknown",
      });
    } catch (imageError) {
      log.error("story-image:attach:error", "interaction", {
        message: imageError instanceof Error ? imageError.message : String(imageError),
      });
      setError(friendlyError(imageError));
    }
  }

  function clearImageDraft() {
    setImageFile(null);
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    log.logInteraction("story-image:remove-draft");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCoordinate) {
      return;
    }

    setError(null);
    if (saveUnavailableMessage) {
      setError(saveUnavailableMessage);
      return;
    }

    const happenedAtMs = parseLocalDatetimeInputValue(happenedAtInput);
    if (happenedAtInput && happenedAtMs === null) {
      setError("Please enter a valid date and time.");
      return;
    }

    log.logInteraction("form:submit", {
      isFromMission,
      showInStory,
      source: selectedCoordinate.source,
      happenedAtSet: happenedAtMs !== null,
      happenedAtFromNowMs:
        happenedAtMs !== null ? happenedAtMs - Date.now() : null,
    });

    onSave({
      title: title.trim() ? title : undefined,
      note: note.trim() ? note : undefined,
      locationLabel: locationLabel.trim() ? locationLabel : undefined,
      showInStory,
      lat: selectedCoordinate.lat,
      lon: selectedCoordinate.lon,
      imageSize,
      source: selectedCoordinate.source,
      missionId: prefill?.missionId,
      ...(happenedAtMs !== null ? { happenedAt: happenedAtMs } : {}),
    }, imageFile ?? undefined);

    onClose();
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
        <div className="relative flex items-start justify-between gap-2 px-4 pt-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[var(--header-gradient)]" />
          <div className="flex min-w-0 flex-col gap-1">
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
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
            Happened at
            <Input
              type="datetime-local"
              value={happenedAtInput}
              onChange={(e) => {
                const next = e.target.value;
                log.logInteraction("happened-at:change", {
                  oldTime: happenedAtInput,
                  newTime: next,
                });
                setHappenedAtInput(next);
              }}
            />
            {(() => {
              const ms = parseLocalDatetimeInputValue(happenedAtInput);
              if (ms === null) return null;
              if (ms - Date.now() > FUTURE_WARNING_MS) {
                return (
                  <span className="text-xs font-normal text-[var(--amber)]">
                    Heads up — that's more than 24h in the future.
                  </span>
                );
              }
              return null;
            })()}
          </label>
          {onUploadImage ? (
            <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--ink-1)]">Photo</span>
                {imageFile ? (
                  <button
                    type="button"
                    onClick={clearImageDraft}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[var(--ink-danger)] hover:bg-[var(--bg-danger)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                ) : null}
              </div>
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt=""
                  className="max-h-48 w-full rounded-md object-cover"
                  onLoad={() => log.logInteraction("story-image:render", { source: "draft" })}
                  onError={() => log.error("story-image:render:error", "ui", { source: "draft" })}
                />
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--line-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-paper-2)]">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => handleImageChange(event.currentTarget.files?.[0])}
                  />
                </label>
              )}
              <div className="mt-1 flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
                  Display Size
                </span>
                <div className="flex rounded-lg border border-[var(--line-soft)] bg-[var(--bg-paper)] p-0.5">
                  {STORY_IMAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setImageSize(size);
                        log.logInteraction("story-image:size-change", { size });
                      }}
                      className={
                        imageSize === size
                          ? "flex-1 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 py-1 text-[11px] font-bold capitalize text-[var(--ink-1)] shadow-sm transition-all"
                          : "flex-1 rounded-md border border-transparent px-2 py-1 text-[11px] font-bold capitalize text-[var(--ink-3)] transition-all hover:text-[var(--ink-2)]"
                      }
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
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
              className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]"
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
                type="button"
                variant="outline"
                onClick={onBack}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit">
              {isFromMission ? "Save story" : "Save pin"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
