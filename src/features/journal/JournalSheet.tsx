import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  CheckSquare,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { FilterButton } from "../../components/ui/FilterButton";
import { LocationPickerField } from "../map/MapPicker";

import { tripcastApi } from "../../convex/tripcastApi";
import type { JournalEvent, JournalEventType, JournalNarrativeLevel, Role } from "../../convex/tripcastApi";
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
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { TERMS } from "../../copy/terminology";
import AttributionPublicLine from "../attributions/AttributionPublicLine";
import { useSheetPersonalities, type SheetPersonality } from "../redesign/sheetPersonality";

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
  onRequestCoordinatePick?: (callback: (coord: { lat: number; lon: number }) => void) => void;
  /** True while a map coordinate pick is in progress — hides the sheet so the map is tappable. */
  isPickingCoordinate?: boolean;
  debugSource?: { source: string; sourceLabel: string };
};

export default function JournalSheet({
  events,
  token,
  open,
  role,
  onClose,
  onStorySelect,
  onLocationFocus,
  onMarkAllRead,
  onRequestCoordinatePick,
  isPickingCoordinate,
  debugSource,
}: JournalSheetProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("story");
  const [viewMode, setViewMode] = useState<"list" | "create">("list");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyBody, setStoryBody] = useState("");
  const [storyLocation, setStoryLocation] = useState("");
  const [storyLat, setStoryLat] = useState<number | undefined>(undefined);
  const [storyLon, setStoryLon] = useState<number | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const costMap = useQuery(tripcastApi.travelFunds.getLinkedCostMap, open ? { token } : "skip");
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const log = useDebugLogger("JournalSheet", "src/features/journal/JournalSheet.tsx");
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

  async function handleCreateStory() {
    setIsCreating(true);
    setCreateError(null);
    try {
      await addCheckpoint({
        token,
        title: storyTitle.trim() || undefined,
        note: storyBody.trim() || undefined,
        locationLabel: storyLocation.trim() || undefined,
        lat: storyLat,
        lon: storyLon,
        showInStory: true,
        source: "inline_form",
      });
      setStoryTitle("");
      setStoryBody("");
      setStoryLocation("");
      setStoryLat(undefined);
      setStoryLon(undefined);
      setViewMode("list");
    } catch (e) {
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
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
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
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white shadow-sm"
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
                    onRequestCoordinatePick((coord) => {
                      setStoryLat(coord.lat);
                      setStoryLon(coord.lon);
                    });
                  }}
                  onClear={() => {
                    setStoryLat(undefined);
                    setStoryLon(undefined);
                  }}
                />
              )}
              {createError && (
                <p className="text-sm text-rose-600" role="alert">{createError}</p>
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

  return (
    <li className="grid grid-cols-[28px_1fr] gap-3 py-1.5">
      <div className="flex flex-col items-center">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm"
          style={{ background: visual.tint }}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {!isLast ? (
          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-[var(--line-soft)]" />
        ) : null}
      </div>

      <button
        type="button"
        onClick={onSelect}
        aria-label={cardLabel}
        className={cn(
          "group relative mb-2 flex flex-col items-stretch overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] text-left shadow-[var(--shadow-card)] transition-transform",
          "active:scale-[0.99]",
        )}
      >
        {/* Date tape header */}
        <div
          className="flex items-center gap-2 px-3 py-1"
          style={{ background: visual.tint }}
          aria-hidden="true"
        >
          <span className="font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-white/90">
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

          {event.body ? (
            <p className="line-clamp-2 text-[13px] leading-snug text-[var(--ink-2)]">
              {event.body}
            </p>
          ) : null}

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
      </button>
    </li>
  );
}
