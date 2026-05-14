import { useState } from "react";
import type { HistoryEvent } from "../../convex/tripcastApi";

const PREVIEW_LENGTH = 140;

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
    case "traveler_state_updated": return "State Updated";
    case "emergency_reset": return "Emergency Reset";
  }
}

type HistoryEventCardProps = {
  event: HistoryEvent;
  onLocationFocus: ((coord: { lat: number; lon: number }) => void) | null;
};

export default function HistoryEventCard({ event, onLocationFocus }: HistoryEventCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasLocation = event.lat !== undefined && event.lon !== undefined;
  const body = event.body ?? "";
  const needsReadMore = body.length > PREVIEW_LENGTH;
  const preview = needsReadMore ? body.slice(0, PREVIEW_LENGTH).trimEnd() + "…" : body;

  function handleFocusMap() {
    if (hasLocation && onLocationFocus) {
      onLocationFocus({ lat: event.lat!, lon: event.lon! });
    }
  }

  if (event.type === "check_in") {
    return (
      <div className="border border-slate-200 rounded-md p-3 flex flex-col gap-1 bg-white">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-navy">{eventTypeLabel(event.type)}</span>
          <span>{formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}</span>
        </div>
        {event.title && (
          <p className="font-semibold text-sm text-navy">{event.title}</p>
        )}
        {event.locationLabel && (
          <p className="text-xs text-muted-foreground">{event.locationLabel}</p>
        )}
        {body && (
          <div className="mt-1 text-sm text-foreground">
            {expanded ? (
              <p className="whitespace-pre-wrap">{body}</p>
            ) : (
              <p>{preview}</p>
            )}
            {needsReadMore && (
              <button
                type="button"
                className="text-xs text-navy underline mt-1"
                onClick={() => setExpanded((p) => !p)}
              >
                {expanded ? "Collapse" : "Read more"}
              </button>
            )}
          </div>
        )}
        {hasLocation && onLocationFocus && (
          <button
            type="button"
            className="mt-1 self-start text-xs text-navy underline"
            onClick={handleFocusMap}
          >
            Focus on map
          </button>
        )}
      </div>
    );
  }

  if (event.type === "traveler_state_updated") {
    return (
      <div className="border border-slate-200 rounded-md p-3 flex flex-col gap-1 bg-white">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-navy">{eventTypeLabel(event.type)}</span>
          <span>{formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}</span>
        </div>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
    );
  }

  // Route vote and challenge cards
  return (
    <div className="border border-slate-200 rounded-md p-3 flex flex-col gap-1 bg-white">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-navy">{eventTypeLabel(event.type)}</span>
        <span>{formatDate(event.occurredAt)} · {formatTime(event.occurredAt)}</span>
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
          onClick={handleFocusMap}
        >
          Focus on map
        </button>
      )}
    </div>
  );
}
