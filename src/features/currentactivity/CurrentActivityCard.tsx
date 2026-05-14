import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";

import { tripcastApi } from "../../convex/tripcastApi";
import type { CurrentActivity, Role } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type CurrentActivityCardProps = {
  token: string;
  role: Role;
  onCompleteAsCheckIn: (activity: CurrentActivity) => void;
  onRequestSetActivity: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(startedAt: number, now: number): string {
  const ms = now - startedAt;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Traveler inner component
// ---------------------------------------------------------------------------

function TravelerActivityCard({
  token,
  onCompleteAsCheckIn,
  onRequestSetActivity,
}: {
  token: string;
  onCompleteAsCheckIn: (activity: CurrentActivity) => void;
  onRequestSetActivity: () => void;
}) {
  const activity = useQuery(tripcastApi.currentActivity.travelerGetCurrentActivity, { token });
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  const dropMutation = useMutation(tripcastApi.currentActivity.travelerDropCurrentActivity);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function drop(args: { token: string; activityId: string }) {
    if (isDropping) return;
    setIsDropping(true);
    try {
      await dropMutation(args);
    } finally {
      setIsDropping(false);
    }
  }

  // Loading
  if (activity === undefined) return null;

  // No active activity
  if (activity === null) {
    return (
      <div className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm" aria-label="Current Activity">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span>⚡</span>
          <span className="flex-1">Nothing active</span>
        </div>
        <div className="border-t px-2 py-1.5">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={onRequestSetActivity}
          >
            Set Activity
          </Button>
        </div>
      </div>
    );
  }

  // Active activity
  return (
    <div className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm" aria-label="Current Activity">
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium">
        <span>{activity.emoji ?? "⚡"}</span>
        <span className="truncate flex-1">{activity.title}</span>
        <span className="text-muted-foreground shrink-0">{formatElapsed(activity.startedAt, now)}</span>
      </div>
      {/* Divider + body */}
      {(activity.note || activity.locationLabel) && (
        <div className="border-t px-2.5 py-1.5 text-xs text-muted-foreground space-y-0.5">
          {activity.note && (
            <p className="truncate">{activity.note.length > 60 ? activity.note.slice(0, 60) + "…" : activity.note}</p>
          )}
          {activity.locationLabel && (
            <p className="truncate italic">{activity.locationLabel}</p>
          )}
        </div>
      )}
      {/* Actions */}
      <div className="border-t px-2 py-1.5 flex flex-col gap-1">
        <Button
          size="sm"
          variant="default"
          className="w-full h-7 text-xs"
          onClick={() => onCompleteAsCheckIn(activity)}
        >
          Complete as Check-in
        </Button>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs"
            onClick={onRequestSetActivity}
          >
            Change
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => drop({ token, activityId: activity._id })}
            disabled={isDropping}
          >
            Drop
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Support crew inner component
// ---------------------------------------------------------------------------

function SupportCrewActivityCard({ token }: { token: string }) {
  const activity = useQuery(tripcastApi.currentActivity.supportCrewGetCurrentActivity, { token });
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Loading or no activity — hide entirely
  if (activity === undefined || activity === null) return null;

  return (
    <div className="w-56 rounded-lg border bg-background/95 shadow-md backdrop-blur-sm" aria-label="Current Activity">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium">
        <span>{activity.emoji ?? "⚡"}</span>
        <span className="truncate flex-1">{activity.title}</span>
        <span className="text-muted-foreground shrink-0">{formatElapsed(activity.startedAt, now)}</span>
      </div>
      {(activity.note || activity.locationLabel) && (
        <div className="border-t px-2.5 py-1.5 text-xs text-muted-foreground space-y-0.5">
          {activity.note && (
            <p className="truncate">{activity.note.length > 60 ? activity.note.slice(0, 60) + "…" : activity.note}</p>
          )}
          {activity.locationLabel && (
            <p className="truncate italic">{activity.locationLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — dispatches by role
// ---------------------------------------------------------------------------

export default function CurrentActivityCard({
  token,
  role,
  onCompleteAsCheckIn,
  onRequestSetActivity,
}: CurrentActivityCardProps) {
  if (role === "traveler") {
    return (
      <TravelerActivityCard
        token={token}
        onCompleteAsCheckIn={onCompleteAsCheckIn}
        onRequestSetActivity={onRequestSetActivity}
      />
    );
  }
  return <SupportCrewActivityCard token={token} />;
}
