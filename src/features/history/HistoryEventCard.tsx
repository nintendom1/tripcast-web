import type { HistoryEvent } from "../../convex/tripcastApi";
import { getStateEmoji } from "../travelstate/travelerStateUtils";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function eventTypeLabel(type: HistoryEvent["type"]): string {
  switch (type) {
    case "check_in": return "Check-in";
    case "challenge_planned": return "Challenge Planned";
    case "challenge_in_progress": return "Challenge Started";
    case "challenge_completed": return "Challenge Completed";
    case "challenge_dropped": return "Challenge Dropped";
    case "route_vote_opened": return "Vote Opened";
    case "route_vote_closed": return "Vote Closed";
    case "route_vote_resolved": return "Vote Resolved";
    case "emergency_reset": return "Emergency Reset";
  }
}

type HistoryEventCardProps = {
  event: HistoryEvent;
  onCheckInSelect: ((event: HistoryEvent) => void) | null;
  onLocationFocus: ((coord: { lat: number; lon: number }) => void) | null;
};

export default function HistoryEventCard({
  event,
  onCheckInSelect,
  onLocationFocus,
}: HistoryEventCardProps) {
  const hasLocation = event.lat !== undefined && event.lon !== undefined;

  if (event.type === "check_in") {
    const hasState =
      event.moodValue !== undefined ||
      event.energyLevel !== undefined ||
      event.stomachLevel !== undefined ||
      event.stressLevel !== undefined ||
      event.schedulePressureLevel !== undefined;

    const emoji = hasState
      ? getStateEmoji({
          moodValue: event.moodValue,
          energyLevel: event.energyLevel,
          stomachLevel: event.stomachLevel,
        })
      : null;

    return (
      <button
        type="button"
        className="w-full text-left border border-slate-200 rounded-md p-3 flex flex-col gap-1 bg-white hover:bg-slate-50 active:bg-slate-100 transition-colors"
        onClick={() => onCheckInSelect?.(event)}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-navy">{eventTypeLabel(event.type)}</span>
            {emoji && <span aria-hidden="true">{emoji}</span>}
          </div>
          <span className="shrink-0">{formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}</span>
        </div>
        {event.title && (
          <p className="font-semibold text-sm text-navy">{event.title}</p>
        )}
        {event.locationLabel && (
          <p className="text-xs text-muted-foreground">{event.locationLabel}</p>
        )}
        {event.body && (
          <p className="text-sm text-foreground line-clamp-2">{event.body}</p>
        )}
      </button>
    );
  }

  // Route vote and challenge cards
  return (
    <div className="border border-slate-200 rounded-md p-3 flex flex-col gap-1 bg-white">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-navy">{eventTypeLabel(event.type)}</span>
        <span className="shrink-0">{formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}</span>
      </div>
      {event.title && (
        <p className="font-semibold text-sm text-navy">{event.title}</p>
      )}
      {event.locationLabel && (
        <p className="text-xs text-muted-foreground">{event.locationLabel}</p>
      )}
      {hasLocation && onLocationFocus && (
        <button
          type="button"
          className="mt-1 self-start text-xs text-navy underline"
          onClick={() => onLocationFocus({ lat: event.lat!, lon: event.lon! })}
        >
          Focus on map
        </button>
      )}
    </div>
  );
}
