import { useEffect } from "react";
import { X } from "lucide-react";

import type { HistoryEvent } from "../../convex/tripcastApi";
import { StatBar } from "../../components/rpg/StatBar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
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

type CheckInDetailSheetProps = {
  event: HistoryEvent | null;
  onClose: () => void;
  onLocationFocus: (coord: { lat: number; lon: number }) => void;
};

function CheckInDetail({
  event,
  onClose,
}: {
  event: HistoryEvent;
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
            {event.title ?? "Check-in"}
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
              State at check-in
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

export default function CheckInDetailSheet({
  event,
  onClose,
  onLocationFocus,
}: CheckInDetailSheetProps) {
  useEffect(() => {
    if (event?.lat !== undefined && event?.lon !== undefined) {
      onLocationFocus({ lat: event.lat, lon: event.lon });
    }
  // Auto-focus when event opens; onLocationFocus is stable
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
        className="z-[11] shadow-2xl max-h-[50dvh]"
        data-role="check-in-detail"
      >
        {event ? (
          <CheckInDetail key={event._id} event={event} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
