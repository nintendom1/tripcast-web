export type FixOutcome = "emitted" | "rejected";

export type RecentFix = {
  lat: number;
  lon: number;
  sampledAt: number;
  outcome: FixOutcome;
};

export const PENDING_TTL_MS = 30 * 60 * 1000;

export function pushRecentFix(
  buffer: readonly RecentFix[],
  next: RecentFix,
  nowMs: number,
  ttlMs: number = PENDING_TTL_MS,
): RecentFix[] {
  const cutoff = nowMs - ttlMs;
  const trimmed: RecentFix[] = [];
  for (const fix of buffer) {
    if (fix.sampledAt >= cutoff) trimmed.push(fix);
  }
  trimmed.push(next);
  return trimmed;
}
