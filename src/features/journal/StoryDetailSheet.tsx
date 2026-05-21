import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { X } from "lucide-react";

import { Button } from "../../components/ui/button";
import { StatBar } from "../../components/rpg/StatBar";

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
import { RevealText } from "../../components/ui/RevealText";
import AttributionBlock from "../attributions/AttributionBlock";
import AwardBadgeSheet from "../achievements/AwardBadgeSheet";
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
}: StoryDetailSheetProps) {
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

  const isNarrative = event?.narrativeLevel === "narrative";

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

function NarrativeBody({
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
  const [awardBadgeOpen, setAwardBadgeOpen] = useState(false);
  const isTraveler = role === "traveler";
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
        <SheetCloseButton aria-label="Close story" />
      </div>

      <SheetBody
        className="px-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
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
            />
          </div>
        ) : null}

        {isTraveler && token && event.checkpointId ? (
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
      </SheetBody>
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
