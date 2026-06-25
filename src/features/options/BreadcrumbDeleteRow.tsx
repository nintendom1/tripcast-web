import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { distanceMeters } from "../../lib/geoUtils";
import type { LiveTrailPreviewSample } from "../../convex/tripcastApi";

dayjs.extend(utc);
dayjs.extend(timezone);

// True GPS jitter is a large jump over a short interval (an implausible speed),
// not steady travel across sparsely sampled points. We flag a row only when the
// implied speed exceeds plausible ground travel, and a distance floor keeps
// sub-accuracy wobble from tripping the warning.
export const JITTER_MIN_DISTANCE_M = 100; // ignore small wobble within GPS accuracy
export const JITTER_MAX_SPEED_MPS = 55; // ~198 km/h: above plausible ground travel

function formatDurationConcise(ms: number) {
  const seconds = Math.floor(Math.abs(ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function BreadcrumbDeleteRow({
  index,
  sample,
  prevSample,
  timeZone,
  checked,
  onToggle,
}: {
  index: number;
  sample: LiveTrailPreviewSample;
  prevSample: LiveTrailPreviewSample | null;
  timeZone: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const dist = prevSample ? distanceMeters(prevSample, sample) : null;
  const timeDiff = prevSample ? sample.sampledAt - prevSample.sampledAt : null;
  const speedMps =
    dist !== null && timeDiff !== null && timeDiff > 0 ? dist / (timeDiff / 1000) : null;
  const isJumpy =
    dist !== null &&
    dist > JITTER_MIN_DISTANCE_M &&
    (timeDiff === 0 || (speedMps !== null && speedMps > JITTER_MAX_SPEED_MPS));

  return (
    <label
      className={cn(
        "flex items-center gap-3 border-b border-[var(--line-soft)] px-3 py-2 text-sm last:border-b-0 transition-colors",
        isJumpy && "bg-[var(--bg-danger)]"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-[var(--ink-1)]">
          #{index + 1} · {dayjs(sample.sampledAt).tz(timeZone).format("MMM D, h:mm:ss A")}
        </span>
        {dist !== null && (
          <span
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-tight",
              isJumpy
                ? "bg-[var(--bg-danger)] text-[var(--ink-danger)]"
                : "bg-[var(--meter-track)] text-[var(--ink-3)]"
            )}
            aria-label={isJumpy ? "Possible GPS jitter" : undefined}
          >
            {isJumpy && <AlertTriangle className="h-2.5 w-2.5" aria-hidden />}
            {Math.round(dist)}m
            {timeDiff !== null && (
              <span className="opacity-70"> / {formatDurationConcise(timeDiff)}</span>
            )}
          </span>
        )}
      </span>
    </label>
  );
}
