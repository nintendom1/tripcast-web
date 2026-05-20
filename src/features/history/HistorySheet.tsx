import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  ChevronRight,
  MapPin,
  Plus,
  Sparkles,
  Trophy,
  Vote as VoteIcon,
  type LucideIcon,
} from "lucide-react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { HistoryEvent, HistoryEventType, HistoryStoryLevel, Role } from "../../convex/tripcastApi";
import {
  Sheet,
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
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { SwipeRow } from "../../components/ui/SwipeRow";
import { ConfirmDelete } from "../../components/ui/ConfirmDelete";
import { cn } from "@/lib/utils";
import { getStateEmoji } from "../travelstate/travelerStateUtils";
import { formatUsd } from "../travelfunds/currency";
import { useMusicSafe } from "../../providers/MusicProvider";
import { useDebugLogger } from "../../debug/useDebugLogger";

import EditCheckpointSheet from "./EditCheckpointSheet";

type FilterTab = "story" | "all" | "checkins" | "challenges" | "votes";

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "story", label: "Story" },
  { id: "all", label: "All" },
  { id: "checkins", label: "Check-ins" },
  { id: "challenges", label: "Challenges" },
  { id: "votes", label: "Votes" },
];

const EMPTY_COPY: Record<FilterTab, string> = {
  story: "No story entries yet.",
  all: "No entries.",
  checkins: "No check-ins yet.",
  challenges: "No mission events yet.",
  votes: "No vote events yet.",
};

function filterEvents(events: HistoryEvent[], tab: FilterTab): HistoryEvent[] {
  switch (tab) {
    case "story": {
      // Story tab = narrative content the reader wants to read: check-ins
      // (story-level) and challenge completions that don't already have a
      // paired story-level check-in pointing at the same challenge. The
      // Complete-as-Story flow lands BOTH a `check_in` (with `challengeId`)
      // and a `challenge_completed` event; the check-in is the canonical
      // narrative row and the challenge_completed row is the auto-emitted
      // status announcement, so we hide it. The backend also tags
      // `route_vote_resolved` + `challenge_planned` as storyLevel "story"
      // — those are status announcements, not narratives.
      const challengeIdsCoveredByCheckIns = new Set<string>();
      for (const e of events) {
        if (e.type === "check_in" && e.storyLevel === "story" && e.challengeId) {
          challengeIdsCoveredByCheckIns.add(e.challengeId);
        }
      }
      return events.filter((e) => {
        if (e.storyLevel !== "story") return false;
        if (e.type === "check_in") return true;
        if (e.type === "challenge_completed") {
          return !e.challengeId || !challengeIdsCoveredByCheckIns.has(e.challengeId);
        }
        return false;
      });
    }
    case "all":
      return events;
    case "checkins":
      return events.filter((e) => e.type === "check_in");
    case "challenges":
      return events.filter((e) => e.type.startsWith("challenge_"));
    case "votes":
      return events.filter((e) => e.type.startsWith("route_vote_"));
  }
}

type EventVisual = {
  Icon: LucideIcon;
  /** CSS custom property name (with `var(--…)`) for the icon background tint. */
  tint: string;
  /** Compact label shown above the title row. */
  kicker: string;
};

function visualForEvent(type: HistoryEventType, storyLevel: HistoryStoryLevel): EventVisual {
  if (type === "check_in") {
    return storyLevel === "story"
      ? { Icon: Camera, tint: "var(--amber)", kicker: "Story · Check-in" }
      : { Icon: MapPin, tint: "var(--ink-1)", kicker: "Check-in" };
  }
  if (type.startsWith("challenge_")) {
    return { Icon: Trophy, tint: "var(--plum)", kicker: "Mission" };
  }
  if (type.startsWith("route_vote_")) {
    return { Icon: VoteIcon, tint: "var(--flag)", kicker: "Vote" };
  }
  return { Icon: Sparkles, tint: "var(--teal)", kicker: "Event" };
}

function eventTypeLabel(type: HistoryEventType): string {
  switch (type) {
    case "check_in": return "Check-in";
    case "challenge_proposed": return "Mission proposed";
    case "challenge_visible": return "Mission accepted";
    case "challenge_planned": return "Mission planned";
    case "challenge_in_progress": return "Mission started";
    case "challenge_completed": return "Mission completed";
    case "challenge_dropped": return "Mission dropped";
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

type HistorySheetProps = {
  events: HistoryEvent[];
  token: string;
  /** Role gates the edit/delete swipe actions on check-in rows — Traveler only. */
  role?: Role;
  onClose: () => void;
  onCheckInSelect: (event: HistoryEvent) => void;
  onStorySelect: (event: HistoryEvent) => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
  onMarkAllRead: () => void;
};

export default function HistorySheet({
  events,
  token,
  role,
  onClose,
  onCheckInSelect,
  onStorySelect,
  onLocationFocus,
  onMarkAllRead,
}: HistorySheetProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("story");
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HistoryEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HistoryEvent | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "create">("list");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyBody, setStoryBody] = useState("");
  const [storyLocation, setStoryLocation] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const costMap = useQuery(tripcastApi.travelFunds.getLinkedCostMap, { token });
  const deleteCheckpoint = useMutation(tripcastApi.checkpoints.deleteCheckpoint);
  const addCheckpoint = useMutation(tripcastApi.checkpoints.addCheckpoint);
  const music = useMusicSafe();
  const log = useDebugLogger("HistorySheet", "src/features/history/HistorySheet.tsx");

  useEffect(() => {
    return () => { onMarkAllRead(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      const h = containerRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) log.logInteraction("sheet:size", { heightPx: Math.round(h), viewportPx: window.innerHeight });
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filterEvents(events, activeTab);
  const isTraveler = role === "traveler";

  async function handleConfirmDelete() {
    if (!pendingDelete || pendingDelete.type !== "check_in" || !pendingDelete.checkpointId) {
      setPendingDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteCheckpoint({ token, checkpointId: pendingDelete.checkpointId });
      music.sfx("success");
      setPendingDelete(null);
    } catch {
      // The mutation throws ConvexError on rate-limit or auth issues — close
      // the confirm but leave the row in the list (the data subscription
      // will refresh if it actually landed).
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCreateStory() {
    setIsCreating(true);
    setCreateError(null);
    try {
      await addCheckpoint({
        token,
        title: storyTitle.trim() || undefined,
        note: storyBody.trim() || undefined,
        locationLabel: storyLocation.trim() || undefined,
        showInStory: true,
        source: "inline_form",
      });
      setStoryTitle("");
      setStoryBody("");
      setStoryLocation("");
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
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          if (editingEvent !== null || pendingDelete !== null) return;
          log.logInteraction("sheet:close", { trigger: "backdrop" });
          onClose();
        }
      }}
    >
      <SheetContent
        ref={containerRef}
        side="bottom"
        showBackdrop={false}
        className="z-[10] max-h-[60dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <SheetGrabber />
        <div className="flex items-start justify-between gap-2 px-4 pt-2">
          <div className="flex flex-col gap-1">
            <SheetKicker dotColor="var(--flag)">Journal</SheetKicker>
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
              {viewMode === "create" ? "New story entry" : "Trip story"}
            </SheetTitle>
          </div>
          <div className="flex items-center gap-2">
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
            <SheetCloseButton aria-label="Close history" />
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
        <SheetTabs aria-label="History filters" className="mt-3">
          {FILTER_TABS.map((tab) => (
            <SheetTab
              key={tab.id}
              id={`history-tab-${tab.id}`}
              aria-controls="history-tabpanel"
              active={activeTab === tab.id}
              onClick={() => {
                log.logInteraction("filter:change", { from: activeTab, to: tab.id });
                setActiveTab(tab.id);
                setSwipedId(null);
              }}
            >
              {tab.label}
            </SheetTab>
          ))}
        </SheetTabs>

        <SheetBody
          id="history-tabpanel"
          role="tabpanel"
          aria-labelledby={`history-tab-${activeTab}`}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">{EMPTY_COPY[activeTab]}</p>
          ) : (
            <ol className="flex flex-col">
              {filtered.map((event, index) => {
                let actualCostUsd: number | undefined;
                if (costMap) {
                  if (event.type === "check_in" && event.checkpointId) {
                    actualCostUsd = costMap.byCheckpointId[event.checkpointId];
                  } else if (event.type === "challenge_completed" && event.challengeId) {
                    actualCostUsd = costMap.byChallengeId[event.challengeId];
                  }
                }
                const canSwipe = isTraveler && event.type === "check_in" && Boolean(event.checkpointId);
                const item = (
                  <StoryRailItem
                    event={event}
                    isLast={index === filtered.length - 1}
                    actualCostUsd={actualCostUsd}
                    onSelect={() => {
                      log.logInteraction("row:click", { type: event.type, storyLevel: event.storyLevel });
                      if (event.type === "check_in") {
                        if (event.storyLevel === "story") {
                          onStorySelect(event);
                        } else {
                          onCheckInSelect(event);
                        }
                      } else if (event.lat !== undefined && event.lon !== undefined) {
                        onLocationFocus({ lat: event.lat, lon: event.lon });
                      }
                    }}
                  />
                );
                if (!canSwipe) return <span key={event._id}>{item}</span>;
                return (
                  <SwipeRow
                    key={event._id}
                    id={event._id}
                    openId={swipedId}
                    onOpenChange={setSwipedId}
                    onEdit={() => setEditingEvent(event)}
                    onDelete={() => setPendingDelete(event)}
                    className="mb-2"
                  >
                    {item}
                  </SwipeRow>
                );
              })}
            </ol>
          )}
        </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>

    <ConfirmDelete
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      title="Delete this check-in?"
      itemLabel={pendingDelete?.title ?? undefined}
      description="The pin disappears from the map and the journal. Linked transactions are kept but unlinked. This can't be undone."
      onConfirm={handleConfirmDelete}
      pending={isDeleting}
    />

    <EditCheckpointSheet
      event={editingEvent}
      token={token}
      onClose={() => setEditingEvent(null)}
    />
    </>
  );
}

type StoryRailItemProps = {
  event: HistoryEvent;
  isLast: boolean;
  actualCostUsd?: number;
  onSelect: () => void;
};

function StoryRailItem({ event, isLast, actualCostUsd, onSelect }: StoryRailItemProps) {
  const visual = visualForEvent(event.type, event.storyLevel);
  const Icon = visual.Icon;
  const isCheckIn = event.type === "check_in";
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
          className="flex h-7 w-7 items-center justify-center rounded-full text-white"
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
          "group relative mb-2 flex flex-col items-stretch gap-1 rounded-2xl bg-[var(--bg-card)] px-3 py-2.5 text-left shadow-[var(--shadow-card)] transition-transform",
          "active:scale-[0.99]",
        )}
      >
        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
          <span className="flex items-center gap-1.5 text-[var(--ink-3)]">
            {fullKicker}
            {stateEmoji ? (
              <span aria-hidden="true" className="text-sm normal-case tracking-normal">
                {stateEmoji}
              </span>
            ) : null}
          </span>
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--ink-3)]">
            {formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}
          </span>
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

        {isCheckIn ? (
          <ChevronRight
            aria-hidden="true"
            className="absolute right-3 top-3 h-4 w-4 text-[var(--ink-3)] transition-colors group-hover:text-[var(--ink-1)]"
          />
        ) : null}
      </button>
    </li>
  );
}
