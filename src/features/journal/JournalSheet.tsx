import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  CheckSquare,
  ChevronRight,
  Clock,
  ImagePlus,
  MapPin,
  Plus,
  Sparkles,
  Trophy,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { FilterButton } from "../../components/ui/FilterButton";
import { LocationPickerField } from "../map/MapPicker";

import { tripcastApi } from "../../convex/tripcastApi";
import type { JournalEvent, JournalEventType, JournalNarrativeLevel, Role, StoryImageSize } from "../../convex/tripcastApi";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { cn } from "@/lib/utils";
import { getStateEmoji } from "../travelstate/travelerStateUtils";
import { formatUsd } from "../travelfunds/currency";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { useCenteringCalibration } from "../../debug/useCenteringCalibration";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { TERMS } from "../../copy/terminology";
import AttributionPublicLine from "../attributions/AttributionPublicLine";
import { ReactionSection } from "../../components/ui/ReactionSection";
import { useSheetPersonalities, type SheetPersonality } from "../redesign/sheetPersonality";
import { uploadStoryImage, validateStoryImageFile } from "./storyImageUpload";
import { useFollowerCutoffPreview } from "../options/followerCutoffPreview";
import { LoadingImage } from "../../components/ui/LoadingImage";

type FilterTab = "story" | "all" | "entries";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "story", label: TERMS.story },
  { value: "all", label: "All" },
  { value: "entries", label: "Entries" },
];

const EMPTY_COPY: Record<FilterTab, string> = {
  story: "No story entries yet.",
  all: "No entries.",
  entries: "No entries yet.",
};

function filterEvents(events: JournalEvent[], tab: FilterTab): JournalEvent[] {
  switch (tab) {
    case "story": {
      // Story tab = narrative content the reader wants to read: Stories
      // (narrative-level) and mission completions that don't already have a
      // paired narrative-level Story pointing at the same mission. The
      // Complete-as-Story flow lands BOTH a `story` (with `missionId`)
      // and a `mission_completed` event; the Story is the canonical
      // narrative row and the mission_completed row is the auto-emitted
      // status announcement, so we hide it. The backend also tags
      // `route_vote_resolved` + `mission_planned` as narrativeLevel "narrative"
      // — those are status announcements, not narratives.
      const missionIdsCoveredByStories = new Set<string>();
      for (const e of events) {
        if (e.type === "story" && e.narrativeLevel === "narrative" && e.missionId) {
          missionIdsCoveredByStories.add(e.missionId);
        }
      }
      return events.filter((e) => {
        if (e.narrativeLevel !== "narrative") return false;
        if (e.type === "story") return true;
        if (e.type === "mission_completed") {
          return !e.missionId || !missionIdsCoveredByStories.has(e.missionId);
        }
        return false;
      });
    }
    case "all":
      return events.filter((e) => !e.type.startsWith("route_vote_"));
    case "entries":
      return events.filter((e) => e.type === "story");
  }
}

type EventVisual = {
  Icon: LucideIcon;
  /** CSS custom property name (with `var(--…)`) for the icon background tint. */
  tint: string;
  /** Compact label shown above the title row. */
  kicker: string;
};

function visualForEvent(
  type: JournalEventType,
  narrativeLevel: JournalNarrativeLevel,
  personalities: { journal: SheetPersonality; missions: SheetPersonality; votes: SheetPersonality },
): EventVisual {
  if (type === "story") {
    return narrativeLevel === "narrative"
      ? { Icon: Camera, tint: personalities.journal.color, kicker: "Story" }
      : { Icon: MapPin, tint: "var(--ink-1)", kicker: TERMS.checkIn };
  }
  if (type.startsWith("mission_")) {
    return { Icon: Trophy, tint: personalities.missions.color, kicker: "Mission" };
  }
  if (type.startsWith("route_vote_")) {
    return { Icon: CheckSquare, tint: personalities.votes.color, kicker: "Vote" };
  }
  return { Icon: Sparkles, tint: "var(--teal)", kicker: "Event" };
}

function eventTypeLabel(type: JournalEventType): string {
  switch (type) {
    case "story": return TERMS.checkIn;
    case "mission_proposed": return "Mission proposed";
    case "mission_visible": return "Mission accepted";
    case "mission_planned": return "Mission planned";
    case "mission_in_progress": return "Mission started";
    case "mission_completed": return "Mission completed";
    case "mission_dropped": return "Mission dropped";
    case "route_vote_opened": return "Vote opened";
    case "route_vote_closed": return "Vote closed";
    case "route_vote_resolved": return "Vote resolved";
    case "emergency_reset": return "Emergency reset";
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

type JournalSheetProps = {
  events: JournalEvent[];
  token: string;
  /** Controls visibility. Kept mounted while closed so the close transition plays. */
  open: boolean;
  /** Role gates the "New" create action — Traveler only. */
  role?: Role;
  onClose: () => void;
  onStorySelect: (event: JournalEvent) => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
  onMarkAllRead: () => void;
  /** Enter map coordinate-pick mode; receives a callback invoked with the picked coord. */
  onRequestCoordinatePick?: (
    callback: (coord: { lat: number; lon: number }) => void,
    options?: { initialCoord?: { lat: number; lon: number } | null },
  ) => void;
  /** Called after a successful story save so TripMap can drop the post-pick
   * preview pin (the real story marker takes over). */
  onCoordinatePickSaved?: () => void;
  /** True while a map coordinate pick is in progress — hides the sheet so the map is tappable. */
  isPickingCoordinate?: boolean;
  debugSource?: { source: string; sourceLabel: string };
};

export default function JournalSheet({
  events: rawEvents,
  token,
  open,
  role,
  onClose,
  onStorySelect,
  onLocationFocus,
  onMarkAllRead,
  onRequestCoordinatePick,
  onCoordinatePickSaved,
  isPickingCoordinate,
  debugSource,
}: JournalSheetProps) {
  // Traveler-only preview: when ON, hide pre-cutoff events so the Traveler sees
  // what the Follower sees. For Followers, server filtering already applied and
  // preview.cutoffAt is null.
  const preview = useFollowerCutoffPreview(role, token);
  const events = useMemo(
    () => preview.cutoffAt
      ? rawEvents.filter((e) => e.occurredAt >= (preview.cutoffAt as number))
      : rawEvents,
    [rawEvents, preview.cutoffAt],
  );
  const [activeTab, setActiveTab] = useState<FilterTab>("story");
  const [viewMode, setViewMode] = useState<"list" | "create">("list");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyBody, setStoryBody] = useState("");
  const [storyLocation, setStoryLocation] = useState("");
  const [storyLat, setStoryLat] = useState<number | undefined>(undefined);
  const [storyLon, setStoryLon] = useState<number | undefined>(undefined);
  const [storyImageFile, setStoryImageFile] = useState<File | null>(null);
  const [storyImagePreviewUrl, setStoryImagePreviewUrl] = useState<string | null>(null);
  const [storyImageSize, setStoryImageSize] = useState<StoryImageSize>("medium");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const costMap = useQuery(tripcastApi.travelFunds.getLinkedCostMap, open ? { token } : "skip");
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const generateStoryImageUploadUrl = useMutation(tripcastApi.checkpoints.generateStoryImageUploadUrl);
  const log = useDebugLogger("JournalSheet", "src/features/journal/JournalSheet.tsx");
  const calibration = useCenteringCalibration();
  const sheetPersonalities = useSheetPersonalities();

  useActiveUiContext(open, {
    sheetName: "JournalSheet",
    label: TERMS.journal,
    view: viewMode === "create" ? "create-story" : `list:${activeTab}`,
    source: debugSource?.source ?? "unknown",
    sourceLabel: debugSource?.sourceLabel ?? "Unknown",
    file: "src/features/journal/JournalSheet.tsx",
  }, { boundsSelector: "[data-role='journal-sheet']" });

  // Mark events read when the sheet closes (open → false edge) and on unmount
  // while open. The sheet now stays mounted while closed so its close
  // animation can play, so we can no longer rely on unmount alone.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) onMarkAllRead();
    wasOpen.current = open;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open) return;
    setViewMode("list");
    setCreateError(null);
    setStoryImageFile(null);
    setStoryImagePreviewUrl(null);
    setStoryImageSize(window.innerWidth < 640 ? "compact" : "medium");
  }, [open]);
  useEffect(() => {
    return () => {
      if (storyImagePreviewUrl) URL.revokeObjectURL(storyImagePreviewUrl);
    };
  }, [storyImagePreviewUrl]);
  useEffect(() => {
    return () => { if (wasOpen.current) onMarkAllRead(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      const h = containerRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) log.logInteraction("sheet:size", { heightPx: Math.round(h), viewportPx: window.innerHeight });
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = filterEvents(events, activeTab);
  const isTraveler = role === "traveler";

  function handleStoryImageChange(file: File | undefined) {
    if (!file) return;
    try {
      validateStoryImageFile(file);
      setStoryImageFile(file);
      setStoryImagePreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
      setCreateError(null);
      log.logInteraction("story-image:attach", {
        bytes: file.size,
        contentType: file.type || "unknown",
      });
    } catch (imageError) {
      log.error("story-image:attach:error", "interaction", {
        message: imageError instanceof Error ? imageError.message : String(imageError),
      });
      setCreateError(imageError instanceof Error ? imageError.message : "Unable to attach image.");
    }
  }

  function clearStoryImageDraft() {
    setStoryImageFile(null);
    setStoryImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    log.logInteraction("story-image:remove-draft");
  }

  async function handleCreateStory() {
    setIsCreating(true);
    setCreateError(null);
    try {
      const imageId = storyImageFile
        ? await (async () => {
            log.logInteraction("story-image:upload:start", {
              bytes: storyImageFile.size,
              contentType: storyImageFile.type || "unknown",
            });
            const uploadedImageId = await uploadStoryImage(storyImageFile, () =>
              generateStoryImageUploadUrl({ token }),
            );
            log.logInteraction("story-image:upload:success", { hasImage: true });
            return uploadedImageId;
          })()
        : undefined;
      await addCheckpoint({
        token,
        title: storyTitle.trim() || undefined,
        note: storyBody.trim() || undefined,
        locationLabel: storyLocation.trim() || undefined,
        lat: storyLat,
        lon: storyLon,
        imageId,
        imageSize: storyImageSize,
        showInStory: true,
        source: "inline_form",
      });
      setStoryTitle("");
      setStoryBody("");
      setStoryLocation("");
      setStoryLat(undefined);
      setStoryLon(undefined);
      setStoryImageFile(null);
      setStoryImagePreviewUrl(null);
      setViewMode("list");
      onCoordinatePickSaved?.();
    } catch (e) {
      log.error("create-story:error", "mutation", {
        message: e instanceof Error ? e.message : String(e),
        hadImage: Boolean(storyImageFile),
      });
      setCreateError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <>
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal={isPickingCoordinate || calibration}
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
        mapAdjacent
        data-role="journal-sheet"
        className={cn(
          "z-[10] max-h-[60dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]",
          isPickingCoordinate && "invisible pointer-events-none",
        )}
      >
        <div aria-hidden="true" className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: sheetPersonalities.journal.color }} />
        <div
          className="flex items-start justify-between gap-2 border-b border-[var(--line-soft)] px-4 pb-3 pt-2"
          style={{ background: `linear-gradient(180deg, ${sheetPersonalities.journal.bg} 0%, var(--bg-paper) 100%)` }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
                style={{ background: sheetPersonalities.journal.color }}
              >
                <Clock className="h-4 w-4" />
              </span>
              <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
                {viewMode === "create" ? `New ${TERMS.story.toLowerCase()} entry` : TERMS.journal}
              </SheetTitle>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === "list" && (
              <FilterButton
                options={FILTER_TABS}
                value={activeTab}
                defaultValue="story"
                onChange={(v) => {
                  log.logInteraction("filter:change", { from: activeTab, to: v });
                  setActiveTab(v);
                }}
              />
            )}
            {isTraveler && viewMode === "list" && (
              <Button
                size="sm"
                type="button"
                className="rounded-full"
                onClick={() => { setCreateError(null); setViewMode("create"); }}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            )}
            <SheetCloseButton aria-label="Close journal" />
          </div>
        </div>

        {viewMode === "create" ? (
          <SheetBody style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="flex flex-col gap-3 p-1">
              <Input
                placeholder="Story title (optional)"
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                maxLength={120}
              />
              <Textarea
                placeholder="What happened?"
                value={storyBody}
                onChange={(e) => setStoryBody(e.target.value)}
                rows={4}
                maxLength={1000}
              />
              <div className="grid gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--ink-1)]">Photo</span>
                  {storyImageFile ? (
                    <button
                      type="button"
                      onClick={clearStoryImageDraft}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-[var(--ink-danger)] hover:bg-[var(--bg-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  ) : null}
                </div>
                {storyImagePreviewUrl ? (
                  <LoadingImage
                    src={storyImagePreviewUrl}
                    alt=""
                    aspectRatio="4/3"
                    containerClassName="max-h-48 w-full rounded-md"
                    className="object-cover"
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
                      onChange={(event) => handleStoryImageChange(event.currentTarget.files?.[0])}
                    />
                  </label>
                )}

                    {storyImagePreviewUrl && (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Display Size</span>
                        <div className="flex p-0.5 bg-[var(--bg-paper)] rounded-lg border border-[var(--line-soft)]">
                          {(["compact", "medium", "large"] as const).map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => {
                                setStoryImageSize(size);
                                log.logInteraction("story-image:size-change", { size });
                              }}
                              className={cn(
                                "flex-1 px-2 py-1 text-[11px] font-bold capitalize rounded-md transition-all",
                                storyImageSize === size
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
              <Input
                placeholder="Location (optional)"
                value={storyLocation}
                onChange={(e) => setStoryLocation(e.target.value)}
                maxLength={120}
              />
              {onRequestCoordinatePick && (
                <LocationPickerField
                  lat={storyLat}
                  lon={storyLon}
                  onPick={() => {
                    log.logInteraction("coordinate:pick-mode:request", { form: "journal-new-story" });
                    onRequestCoordinatePick(
                      (coord) => {
                        setStoryLat(coord.lat);
                        setStoryLon(coord.lon);
                      },
                      storyLat !== undefined && storyLon !== undefined
                        ? { initialCoord: { lat: storyLat, lon: storyLon } }
                        : undefined,
                    );
                  }}
                  onClear={() => {
                    setStoryLat(undefined);
                    setStoryLon(undefined);
                  }}
                />
              )}
              {createError && (
                <p className="rounded-md border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]" role="alert">{createError}</p>
              )}
              <Button type="button" disabled={isCreating} onClick={handleCreateStory}>
                {isCreating ? "Saving…" : "Add to Journal"}
              </Button>
              <button
                type="button"
                className="text-sm text-center text-[var(--ink-3)] underline"
                onClick={() => setViewMode("list")}
              >
                Cancel
              </button>
            </div>
          </SheetBody>
        ) : (
          <>
        <SheetBody
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">{EMPTY_COPY[activeTab]}</p>
          ) : (
            <ol className="flex flex-col">
              {filtered.map((event, index) => {
                let actualCostUsd: number | undefined;
                if (costMap) {
                  if (event.type === "story" && event.checkpointId) {
                    actualCostUsd = costMap.byCheckpointId[event.checkpointId];
                  } else if (event.type === "mission_completed" && event.missionId) {
                    actualCostUsd = costMap.byMissionId[event.missionId];
                  }
                }
                return (
                  <StoryRailItem
                    key={event._id}
                    event={event}
                    token={token}
                    isLast={index === filtered.length - 1}
                    actualCostUsd={actualCostUsd}
                    personalities={sheetPersonalities}
                    onSelect={() => {
                      log.logInteraction("row:click", { type: event.type, narrativeLevel: event.narrativeLevel });
                      if (event.type === "story") {
                        onStorySelect(event);
                      } else if (event.lat !== undefined && event.lon !== undefined) {
                        onLocationFocus({ lat: event.lat, lon: event.lon });
                      }
                    }}
                  />
                );
              })}
            </ol>
          )}
        </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

type StoryRailItemProps = {
  event: JournalEvent;
  token: string;
  isLast: boolean;
  actualCostUsd?: number;
  personalities: ReturnType<typeof useSheetPersonalities>;
  onSelect: () => void;
};

function StoryRailItem({ event, token, isLast, actualCostUsd, personalities, onSelect }: StoryRailItemProps) {
  const visual = visualForEvent(event.type, event.narrativeLevel, personalities);
  const Icon = visual.Icon;
  const isCheckIn = event.type === "story";
  const hasState =
    event.moodValue !== undefined ||
    event.energyLevel !== undefined ||
    event.stomachLevel !== undefined ||
    event.stressLevel !== undefined ||
    event.schedulePressureLevel !== undefined;
  const stateEmoji = isCheckIn && hasState
    ? getStateEmoji({
        moodValue: event.moodValue,
        energyLevel: event.energyLevel,
        stomachLevel: event.stomachLevel,
      })
    : null;

  const fullKicker = isCheckIn ? visual.kicker : eventTypeLabel(event.type);
  const cardLabel = isCheckIn
    ? `${eventTypeLabel(event.type)}: ${event.title ?? "untitled"}`
    : eventTypeLabel(event.type);

  const reactionTarget = event.checkpointId
    ? { id: event.checkpointId, type: "checkpoint" as const }
    : event.missionId
    ? { id: event.missionId, type: "mission" as const }
    : event.routeVoteId
    ? { id: event.routeVoteId, type: "route_vote" as const }
    : null;

  return (
    <li className="grid grid-cols-[28px_1fr] gap-3 py-1.5">
      <div className="flex flex-col items-center">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-on-brand)] shadow-sm"
          style={{ background: visual.tint }}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {!isLast ? (
          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-[var(--line-soft)]" />
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-label={cardLabel}
        className={cn(
          "group relative mb-2 flex flex-col items-stretch overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] text-left shadow-[var(--shadow-card)] transition-transform cursor-pointer",
          "active:scale-[0.99]",
        )}
      >
        {/* Date tape header */}
        <div
          className="flex items-center gap-2 px-3 py-1"
          style={{ background: visual.tint }}
          aria-hidden="true"
        >
          <span className="font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-on-brand)]">
            {formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}
          </span>
          {stateEmoji ? (
            <span className="ml-auto text-sm leading-none">{stateEmoji}</span>
          ) : null}
        </div>

        {/* Card body */}
        <div className="flex flex-col gap-1 px-3 py-2">
          <div className="flex items-start justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
            <span className="text-[var(--ink-3)]">{fullKicker}</span>
            {isCheckIn ? (
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-colors group-hover:text-[var(--ink-1)]"
              />
            ) : null}
          </div>

          {event.title ? (
            <div className="font-[var(--font-display)] text-sm font-bold leading-snug text-[var(--ink-1)]">
              {event.title}
            </div>
          ) : null}

          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            {event.body ? (
              <p className="line-clamp-2 text-[13px] leading-snug text-[var(--ink-2)] md:min-w-0 md:flex-1">
                {event.body}
              </p>
            ) : (
              <div className="hidden md:block md:flex-1" aria-hidden="true" />
            )}

            {reactionTarget ? (
              <ReactionSection
                targetId={reactionTarget.id}
                targetType={reactionTarget.type}
                reactions={event.reactions}
                token={token}
                className="flex justify-end md:shrink-0"
              />
            ) : null}
          </div>

          {event.type === "story" && event.checkpointId ? (
            <AttributionPublicLine
              token={token}
              sourceType="story"
              sourceId={event.checkpointId}
              className="text-[11px] text-[var(--ink-3)]"
            />
          ) : null}

          {event.locationLabel ? (
            <div className="flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {event.locationLabel}
            </div>
          ) : null}

          {actualCostUsd !== undefined && actualCostUsd !== 0 ? (
            <div className="text-[11px] font-semibold" style={{ color: "var(--green)" }}>
              Actual cost: {formatUsd(actualCostUsd)}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
