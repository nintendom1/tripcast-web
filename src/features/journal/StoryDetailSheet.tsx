import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, ChevronLeft, ChevronRight, ImagePlus, MapPin as MapPinIcon, Trash2 } from "lucide-react";
import Zoom from "react-medium-image-zoom";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { StatBar } from "../../components/rpg/StatBar";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { InfoTooltip } from "../../components/ui/info-tooltip";

import { tripcastApi } from "../../convex/tripcastApi";
import type { JournalEvent, Role, StoryImageSize } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useCenteringCalibration } from "../../debug/useCenteringCalibration";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetGradientHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { cn, formatCoordinate, parseLocalDatetimeInputValue, toLocalDatetimeInputValue } from "@/lib/utils";
import { LocationPickerField } from "../map/MapPicker";
import { useSheetPersonalities } from "../redesign/sheetPersonality";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { RevealText } from "../../components/ui/RevealText";
import { useMusicSafe } from "../../providers/MusicProvider";
import { ReactionSection } from "../../components/ui/ReactionSection";
import { LoadingImage } from "../../components/ui/LoadingImage";
import AttributionBlock from "../attributions/AttributionBlock";
import { useFollowerCutoffPreview } from "../options/followerCutoffPreview";
import AwardBadgeSheet from "../achievements/AwardBadgeSheet";
import LinkedTransactionsSection from "../travelfunds/LinkedTransactionsSection";
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
import { extractImageMetadata, uploadStoryImage, validateStoryImageFile, type ImageMetadata } from "./storyImageUpload";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Treat any drift larger than ~1 minute between happenedAt and createdAt as
// "manually set" — the picker is minute-precision so anything smaller is noise.
const MANUAL_TIME_THRESHOLD_MS = 60_000;

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
  onRequestCoordinatePick?: (
    callback: (coord: { lat: number; lon: number }) => void,
    options?: { initialCoord?: { lat: number; lon: number } | null },
  ) => void;
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
  const calibration = useCenteringCalibration();
  const music = useMusicSafe();
  const updateCheckpoint = useMutation(tripcastApi.checkpoints.updateCheckpoint);
  const deleteCheckpoint = useMutation(tripcastApi.checkpoints.deleteCheckpoint);
  const generateStoryImageUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);

  const [isEditing, setIsEditing] = useState(false);
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editLat, setEditLat] = useState<number | undefined>(undefined);
  const [editLon, setEditLon] = useState<number | undefined>(undefined);
  const [editShowInStory, setEditShowInStory] = useState(true);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<string | null>(null);
  const [editImageSize, setEditImageSize] = useState<StoryImageSize>("medium");
  const [editClearImage, setEditClearImage] = useState(false);
  const [editHappenedAt, setEditHappenedAt] = useState<string>("");
  const [editHappenedAtInitial, setEditHappenedAtInitial] = useState<string>("");
  const [editMetadata, setEditMetadata] = useState<ImageMetadata | null>(null);
  const [confirmMetadata, setConfirmMetadata] = useState<{
    type: "date" | "gps";
    newValue: string | { lat: number; lon: number };
    oldValue: string | { lat: number; lon: number };
  } | null>(null);
  const metadataRequestIdRef = useRef(0);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [optimisticEvent, setOptimisticEvent] = useState<JournalEvent | null>(null);

  // Performance instrumentation only — no UI badges, no re-renders. Tracks when
  // we first saw an imageId vs. when its presigned URL resolved, so onImageLoad
  // can break the total latency into URL-fetch and image-download phases.
  const imageLoadMetricsRef = useRef<{
    imageId: string;
    startAt: number;
    urlReadyAt?: number;
  } | null>(null);

  const preferences = useQuery(
    tripcastApi.travelerPreferences.followerGetPreferences,
    role === "follower" && token ? { token } : "skip",
  );
  const followerCutoffAt = preferences?.visible ? preferences.followerContentCutoffAt : undefined;

  // Traveler-side "Preview as Follower" — null when off or not a Traveler.
  const preview = useFollowerCutoffPreview(role, token);

  // Effective cutoff for THIS view:
  // - Follower: derive from followerGetPreferences (deep links / push notifications
  //   can still hand a Follower a pre-cutoff event id even though listJournalEvents
  //   now filters at the server).
  // - Traveler: the preview hook supplies the cutoff when preview is on; otherwise
  //   the Traveler sees everything.
  const effectiveCutoff = role === "follower" ? followerCutoffAt : (preview.cutoffAt ?? undefined);
  const isHiddenByCutoff =
    effectiveCutoff !== undefined && event !== null && event !== undefined && event.occurredAt < effectiveCutoff;

  const displayEvent = isHiddenByCutoff ? null : optimisticEvent?._id === event?._id ? optimisticEvent : event;
  const currentImageUrl = useQuery(
    tripcastApi.checkpoints.getStoryImageUrl,
    displayEvent?.imageId && token ? { token, imageId: displayEvent.imageId } : "skip",
  );
  const isNarrative = displayEvent?.narrativeLevel === "narrative";

  const isTraveler = role === "traveler";
  const canEdit = isTraveler && Boolean(token) && Boolean(displayEvent?.checkpointId);

  useEffect(() => {
    setIsEditing(false);
    setAwardBadgeOpen(false);
    setPendingDelete(false);
    setActionError(null);
    setOptimisticEvent(null);
    setEditImageFile(null);
    setEditImagePreviewUrl(null);
    setEditClearImage(false);
    imageLoadMetricsRef.current = null;
  }, [event?._id]);

  useEffect(() => {
    return () => {
      if (editImagePreviewUrl) URL.revokeObjectURL(editImagePreviewUrl);
    };
  }, [editImagePreviewUrl]);

  useEffect(() => {
    const imageId = displayEvent?.imageId;
    if (!imageId) {
      imageLoadMetricsRef.current = null;
      return;
    }
    const m = imageLoadMetricsRef.current;
    if (!m || m.imageId !== imageId) {
      imageLoadMetricsRef.current = { imageId, startAt: performance.now() };
    } else if (currentImageUrl && !m.urlReadyAt) {
      m.urlReadyAt = performance.now();
    }

    if (currentImageUrl === null && !isWorking) {
      log.error("story-image:render:error", "query", {
        hasImage: true,
        reason: "url-unavailable",
      });
    }
  }, [currentImageUrl, displayEvent?.imageId, log, isWorking]);

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
        current.imageId === event.imageId &&
        current.narrativeLevel === event.narrativeLevel &&
        current.occurredAt === event.occurredAt;
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
    setEditImageFile(null);
    setEditImagePreviewUrl(null);
    setEditImageSize(displayEvent.imageSize ?? "medium");
    setEditClearImage(false);
    setEditMetadata(null);
    const initialHappenedAt = toLocalDatetimeInputValue(new Date(displayEvent.occurredAt));
    setEditHappenedAt(initialHappenedAt);
    setEditHappenedAtInitial(initialHappenedAt);
    setActionError(null);
    setIsEditing(true);
  }

  function cancelEditMode() {
    log.logInteraction("form:cancel", {});
    setIsEditing(false);
    setActionError(null);
    setEditImageFile(null);
    setEditImagePreviewUrl(null);
    setEditClearImage(false);
    setEditMetadata(null);
  }

  async function handleEditImageChange(file: File | undefined) {
    if (!file) return;
    try {
      validateStoryImageFile(file);
      setEditImageFile(file);
      setEditClearImage(false);
      setEditImagePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setActionError(null);
      log.logInteraction("story-image:attach", {
        source: "edit",
        bytes: file.size,
        contentType: file.type || "unknown",
      });

      const requestId = ++metadataRequestIdRef.current;
      const metadata = await extractImageMetadata(file);
      if (requestId !== metadataRequestIdRef.current) return;
      setEditMetadata(metadata);
      if (metadata) {
        log.logInteraction("story-image:metadata-extracted", {
          source: "edit",
          hasDate: metadata.date != null,
          hasGps: metadata.lat != null,
        });
      }
    } catch (imageError) {
      log.error("story-image:attach:error", "interaction", {
        source: "edit",
        message: imageError instanceof Error ? imageError.message : String(imageError),
      });
      setActionError(friendlyError(imageError));
    }
  }

  function clearEditImage() {
    metadataRequestIdRef.current++;
    setEditImageFile(null);
    setEditClearImage(true);
    setEditImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setEditMetadata(null);
    log.logInteraction("story-image:remove", { source: "edit" });
  }

  function handleUseMetadataDate() {
    if (!editMetadata?.date) return;
    const newDate = new Date(editMetadata.date);
    const newValue = toLocalDatetimeInputValue(newDate);
    const oldValue = editHappenedAt;

    setConfirmMetadata({
      type: "date",
      newValue,
      oldValue,
    });
  }

  function handleUseMetadataGps() {
    if (editMetadata?.lat == null || editMetadata?.lon == null) return;
    const newValue = { lat: editMetadata.lat, lon: editMetadata.lon };
    const oldValue =
      editLat !== undefined && editLon !== undefined
        ? { lat: editLat, lon: editLon }
        : "Not set";

    setConfirmMetadata({
      type: "gps",
      newValue,
      oldValue,
    });
  }

  function confirmMetadataChange() {
    if (!confirmMetadata) return;

    if (confirmMetadata.type === "date") {
      setEditHappenedAt(confirmMetadata.newValue as string);
      log.logInteraction("metadata:apply-date", { source: "edit", value: confirmMetadata.newValue });
    } else if (confirmMetadata.type === "gps") {
      const { lat, lon } = confirmMetadata.newValue as { lat: number; lon: number };
      setEditLat(lat);
      setEditLon(lon);
      log.logInteraction("metadata:apply-gps", { source: "edit", lat, lon });
    }

    setConfirmMetadata(null);
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
    imageLoadMetricsRef.current = null;
    log.logInteraction("form:submit", { checkpointId: event.checkpointId });
    try {
      const uploadResult = editImageFile
        ? await (async () => {
            log.logInteraction("story-image:upload:start", {
              source: "edit",
              bytes: editImageFile.size,
              contentType: editImageFile.type || "unknown",
            });
            const result = await uploadStoryImage(editImageFile, () =>
              generateStoryImageUploadUrl({ token }),
            );
            log.logInteraction("story-image:upload:success", { source: "edit", hasImage: true });
            return result;
          })()
        : undefined;
      const imageId = uploadResult?.storageId;
      const happenedAtMs = parseLocalDatetimeInputValue(editHappenedAt);
      const happenedAtChanged =
        editHappenedAt !== editHappenedAtInitial && happenedAtMs !== null;
      await updateCheckpoint({
        token,
        checkpointId: event.checkpointId,
        title: editTitle.trim() ? editTitle : undefined,
        note: editBody.trim() ? editBody : undefined,
        locationLabel: editLocation.trim() ? editLocation : undefined,
        lat: editLat,
        lon: editLon,
        ...(imageId ? { imageId } : {}),
        imageWidth: uploadResult?.width,
        imageHeight: uploadResult?.height,
        imageSize: editImageSize,
        ...(!editImageFile && editClearImage ? { clearImage: true } : {}),
        showInStory: editShowInStory,
        ...(happenedAtChanged ? { happenedAt: happenedAtMs } : {}),
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
        imageId: imageId ?? (editClearImage ? undefined : event.imageId),
        imageWidth: uploadResult?.width ?? (editClearImage ? undefined : event.imageWidth),
        imageHeight: uploadResult?.height ?? (editClearImage ? undefined : event.imageHeight),
        imageSize: editImageSize,
        narrativeLevel: editShowInStory ? "narrative" : "activity",
        ...(happenedAtChanged ? { occurredAt: happenedAtMs } : {}),
      });
      setIsEditing(false);
      setEditImageFile(null);
      setEditImagePreviewUrl(null);
      setEditClearImage(false);
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
      disablePointerDismissal={isPickingCoordinate || calibration}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        className={cn("z-[11] max-h-[62dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]", isPickingCoordinate && "invisible pointer-events-none")}
        data-role="story-detail"
      >
        {isHiddenByCutoff ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--meter-track)] text-[var(--ink-3)]">
              <Trash2 className="h-6 w-6" />
            </div>
            <div className="grid gap-1">
              <h2 className="font-[var(--font-display)] text-lg font-bold text-[var(--ink-1)]">Content hidden</h2>
              <p className="text-sm text-[var(--ink-3)]">This entry is no longer available.</p>
            </div>
            <Button variant="outline" onClick={onClose} className="mt-2">
              Close
            </Button>
          </div>
        ) : displayEvent && (
          <>
            <SheetGradientHeader color={journalPersonality.color} bg={journalPersonality.bg}>
              <div className="flex w-full min-w-0 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="min-w-0 font-[var(--font-display)] text-2xl font-extrabold leading-tight tracking-tight text-[var(--ink-1)]">
                    {displayEvent.title ?? (isNarrative ? "Story" : "Check In")}
                  </SheetTitle>
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
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                    {formatDate(displayEvent.occurredAt)} · {formatTime(displayEvent.occurredAt)}
                    {Math.abs(displayEvent.occurredAt - displayEvent.createdAt) > MANUAL_TIME_THRESHOLD_MS ? (
                      <span className="ml-2 normal-case tracking-normal text-[var(--amber)]">(Edited)</span>
                    ) : null}
                  </p>
                  {displayEvent.locationLabel ? (
                    <p className="font-[var(--font-mono)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                      {displayEvent.locationLabel}
                    </p>
                  ) : null}
                  <ReactionSection
                    targetId={displayEvent.checkpointId || displayEvent._id}
                    targetType="checkpoint"
                    reactions={displayEvent.reactions}
                    token={token}
                    className="ml-auto flex justify-end"
                  />
                </div>
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
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-[var(--ink-1)]">
                    Happened at
                    <Input
                      type="datetime-local"
                      value={editHappenedAt}
                      onChange={(e) => {
                        const next = e.target.value;
                        log.logInteraction("happened-at:change", {
                          oldTime: editHappenedAt,
                          newTime: next,
                        });
                        setEditHappenedAt(next);
                      }}
                    />
                  </label>
                  <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[var(--ink-1)]">Photo</span>
                      {editImagePreviewUrl || (!editClearImage && currentImageUrl) ? (
                        <button
                          type="button"
                          onClick={clearEditImage}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[var(--ink-danger)] hover:bg-[var(--bg-danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                    {editImagePreviewUrl || (!editClearImage && currentImageUrl) ? (
                      <div className="space-y-3">
                        <LoadingImage
                          src={editImagePreviewUrl ?? currentImageUrl ?? undefined}
                          alt=""
                          aspectRatio="4/3"
                          containerClassName="max-h-48 w-full rounded-md"
                          className="object-cover"
                          onLoad={() => log.logInteraction("story-image:render", { source: editImagePreviewUrl ? "draft" : "stored" })}
                          onError={() => log.error("story-image:render:error", "ui", { source: editImagePreviewUrl ? "draft" : "stored" })}
                        />
                        {editImagePreviewUrl && (
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 px-3 text-xs"
                                disabled={!editMetadata?.date}
                                onClick={handleUseMetadataDate}
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                                Use date/time
                              </Button>
                              {!editMetadata?.date && (
                                <InfoTooltip label="No date metadata found">
                                  This photo doesn't have embedded date/time information.
                                </InfoTooltip>
                              )}
                            </div>
                            {onRequestCoordinatePick && (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 px-3 text-xs"
                                  disabled={editMetadata?.lat == null}
                                  onClick={handleUseMetadataGps}
                                >
                                  <MapPinIcon className="h-3.5 w-3.5" />
                                  Use GPS
                                </Button>
                                {editMetadata?.lat == null && (
                                  <InfoTooltip label="No GPS metadata found">
                                    This photo doesn't have embedded location information.
                                  </InfoTooltip>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--line-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-paper-2)]">
                        <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        Add photo
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => handleEditImageChange(e.currentTarget.files?.[0])}
                        />
                      </label>
                    )}

                    {(editImagePreviewUrl || (!editClearImage && currentImageUrl)) && (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Display Size</span>
                        <div className="flex p-0.5 bg-[var(--bg-paper)] rounded-lg border border-[var(--line-soft)]">
                          {(["compact", "medium", "large"] as const).map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => {
                                setEditImageSize(size);
                                log.logInteraction("story-image:size-change", { size });
                              }}
                              className={cn(
                                "flex-1 px-2 py-1 text-[11px] font-bold capitalize rounded-md transition-all",
                                editImageSize === size
                                  ? "bg-[var(--bg-card)] text-[var(--ink-1)] shadow-sm border border-[var(--line-soft)]"
                                  : "text-[var(--ink-3)] hover:text-[var(--ink-2)] border border-transparent"
                              )}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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

                  <ConfirmModal
                    open={confirmMetadata !== null}
                    onOpenChange={(open) => {
                      if (!open) setConfirmMetadata(null);
                    }}
                    title={confirmMetadata?.type === "date" ? "Update date/time?" : "Update location?"}
                    description={
                      <div className="space-y-3">
                        <p>Use the metadata from the photo instead of the current value?</p>
                        <div className="grid grid-cols-2 gap-4 rounded-lg bg-[var(--bg-paper-2)] p-3 text-xs">
                          <div className="space-y-1">
                            <span className="font-bold uppercase tracking-wider text-[var(--ink-3)]">Current</span>
                            <div className="font-mono text-[var(--ink-1)]">
                              {confirmMetadata?.type === "date" ? (
                                confirmMetadata.oldValue as string
                              ) : typeof confirmMetadata?.oldValue === "string" ? (
                                confirmMetadata.oldValue
                              ) : (
                                <>
                                  {formatCoordinate((confirmMetadata?.oldValue as any)?.lat ?? 0)},<br />
                                  {formatCoordinate((confirmMetadata?.oldValue as any)?.lon ?? 0)}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="font-bold uppercase tracking-wider text-[var(--flag)]">Photo</span>
                            <div className="font-mono text-[var(--ink-1)]">
                              {confirmMetadata?.type === "date" ? (
                                confirmMetadata.newValue as string
                              ) : (
                                <>
                                  {formatCoordinate((confirmMetadata?.newValue as any)?.lat ?? 0)},<br />
                                  {formatCoordinate((confirmMetadata?.newValue as any)?.lon ?? 0)}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    }
                    confirmLabel="Update"
                    onConfirm={confirmMetadataChange}
                  />

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
                <NarrativeContent
                  event={displayEvent}
                  token={token}
                  role={role}
                  missionTitle={missionTitle}
                  missionId={missionId}
                  onNavigateToMission={onNavigateToMission}
                  imageUrl={currentImageUrl ?? undefined}
                  onImageLoad={(e) => {
                    const m = imageLoadMetricsRef.current;
                    const now = performance.now();
                    const totalMs = m ? Math.round(now - m.startAt) : undefined;
                    const urlFetchMs = m?.urlReadyAt ? Math.round(m.urlReadyAt - m.startAt) : undefined;
                    const downloadMs = m?.urlReadyAt ? Math.round(now - m.urlReadyAt) : undefined;
                    log.logPerformance("story-image:render", {
                      source: "stored",
                      totalMs,
                      urlFetchMs,
                      downloadMs,
                      naturalWidth: e.currentTarget.naturalWidth,
                      naturalHeight: e.currentTarget.naturalHeight,
                    });
                  }}
                  onImageError={() => log.error("story-image:render:error", "ui", { source: "stored" })}
                  isTraveler={isTraveler}
                />
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
  imageUrl,
  onImageLoad,
  onImageError,
  isTraveler,
}: {
  event: JournalEvent;
  token?: string;
  role?: Role;
  missionTitle?: string;
  missionId?: string;
  onNavigateToMission?: (id: string) => void;
  imageUrl?: string;
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onImageError?: () => void;
  isTraveler: boolean;
}) {
  const imageSize = event.imageSize ?? "medium";

  return (
    <>
      <div className="flow-root">
        {imageUrl ? (
          <div
            data-testid="story-image-container"
            className={cn(
              "mb-3 rounded-md shadow-sm overflow-hidden",
              imageSize === "compact" && "float-right ml-3 w-32 sm:ml-4 sm:w-40",
              imageSize === "medium" && "w-full sm:float-right sm:ml-4 sm:w-64",
              imageSize === "large" && "w-full mb-4"
            )}
          >
            <Zoom>
              <LoadingImage
                src={imageUrl}
                alt=""
                aspectRatio={imageSize === "compact" ? "1/1" : undefined}
                imageWidth={event.imageWidth}
                imageHeight={event.imageHeight}
                containerClassName={cn(
                  "w-full rounded-md",
                  imageSize !== "compact" && "max-h-96"
                )}
                className={cn(
                  "w-full rounded-md",
                  imageSize === "compact" ? "object-cover" : "object-contain"
                )}
                onLoad={onImageLoad}
                onError={onImageError}
              />
            </Zoom>
          </div>
        ) : null}
        {event.body ? (
          <RevealText
            text={event.body}
            className="block font-[var(--font-display)] text-[15px] leading-relaxed text-[var(--ink-1)]"
          />
        ) : (
          <p className="text-sm italic text-[var(--ink-3)]">No story body yet.</p>
        )}
      </div>

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

      {isTraveler && token && event.checkpointId ? (
        <div className="mt-4 border-t border-[var(--line-soft)] pt-3">
          <LinkedTransactionsSection
            token={token}
            mode="linked"
            target={{ type: "checkpoint", id: event.checkpointId }}
          />
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
