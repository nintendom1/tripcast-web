export type FixOutcome = "emitted" | "rejected";

export type RecentFix = {
  lat: number;
  lon: number;
  sampledAt: number;
  outcome: FixOutcome;
};

export const PENDING_TTL_MS = 30 * 60 * 1000;
// Keep the persisted blob bounded: the debug densifier can add a fix every few
// seconds, so cap how many we retain regardless of TTL.
export const RECENT_FIXES_MAX_COUNT = 600;
const RECENT_FIXES_STORAGE_KEY = "tripcast.liveTrail.recentFixes";

// Drop fixes older than the TTL and cap the count. Pure read used both by
// pushRecentFix and by the idle sweep, so stale dots clear even when no new fix
// arrives to trigger a trim.
export function pruneRecentFixes(
  buffer: readonly RecentFix[],
  nowMs: number,
  ttlMs: number = PENDING_TTL_MS,
  maxCount: number = RECENT_FIXES_MAX_COUNT,
): RecentFix[] {
  const cutoff = nowMs - ttlMs;
  const trimmed: RecentFix[] = [];
  for (const fix of buffer) {
    if (fix.sampledAt >= cutoff) trimmed.push(fix);
  }
  // Drop the oldest entries if we're over the count cap.
  return trimmed.length > maxCount ? trimmed.slice(trimmed.length - maxCount) : trimmed;
}

export function pushRecentFix(
  buffer: readonly RecentFix[],
  next: RecentFix,
  nowMs: number,
  ttlMs: number = PENDING_TTL_MS,
  maxCount: number = RECENT_FIXES_MAX_COUNT,
): RecentFix[] {
  return pruneRecentFixes([...buffer, next], nowMs, ttlMs, maxCount);
}

function isRecentFix(value: unknown): value is RecentFix {
  if (typeof value !== "object" || value === null) return false;
  const fix = value as Record<string, unknown>;
  return (
    Number.isFinite(fix.lat) &&
    Number.isFinite(fix.lon) &&
    Number.isFinite(fix.sampledAt) &&
    (fix.outcome === "emitted" || fix.outcome === "rejected")
  );
}

// Restore the debug fix buffer from localStorage, dropping anything past the TTL
// so a stale page reload doesn't resurrect ancient dots. Tolerates missing or
// corrupt storage by returning an empty buffer.
export function loadRecentFixes(
  nowMs: number,
  ttlMs: number = PENDING_TTL_MS,
): RecentFix[] {
  try {
    const raw = localStorage.getItem(RECENT_FIXES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = nowMs - ttlMs;
    return parsed.filter(isRecentFix).filter((fix) => fix.sampledAt >= cutoff);
  } catch {
    return [];
  }
}

export function saveRecentFixes(fixes: readonly RecentFix[]): void {
  try {
    localStorage.setItem(RECENT_FIXES_STORAGE_KEY, JSON.stringify(fixes));
  } catch {
    /* storage unavailable or quota exceeded — debug overlay is best-effort */
  }
}
