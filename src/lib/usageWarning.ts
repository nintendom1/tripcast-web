import type { NativeTrackingMode } from "../native/nativeTrackingState";
import type { UsageResource } from "./usageResources";

/**
 * Convex usage warnings: the shapes the Convex Usage screen receives, the usage
 * guard sent to the phone, the level and copy derived from the phone's estimate,
 * month-end pace, and the toast de-dupe key.
 *
 * Everything here is pure. Callers pass the time in; nothing reads the clock.
 */

/** Level derived from the phone's estimate of this month's Database I/O. */
export type UsageLevel = "ok" | "warn" | "critical" | "paused";

/** Limits the phone applies to its own GPS uploads. */
export type UsageGuard = {
  bytesPerUpload: number;
  monthlyLimitBytes: number;
  pausePercent: number;
};

/**
 * Estimated; 2.8 KB read plus 1.7 KB written per upload, from the backend simulator
 * (tripcast-backend docs/convex-usage.md, "On-device Usage Estimate"); update when that
 * figure changes. Warn at 70 percent, critical at 90.
 */
export const USAGE_GUARD: UsageGuard = { bytesPerUpload: 4500, monthlyLimitBytes: 1_000_000_000, pausePercent: 99 };
const WARN_PERCENT = 70;
const CRITICAL_PERCENT = 90;

/** The phone's estimate for the current UTC month, as reported with its counters. */
export type UsageEstimate = {
  monthKey: string;
  uploads: number;
  bytes: number;
  /** `null` when the phone has no usage guard. */
  limitBytes: number | null;
  paused: boolean;
};

export type UsageFailureCounts = {
  network: number;
  server: number;
  rateLimited: number;
  auth: number;
  paused: number;
  rejected: number;
};

/** One hour of upload counters recorded by the phone. */
export type UsageLedgerBucket = {
  hourStart: number;
  requests: number;
  uploads: number;
  samplesSent: number;
  samplesAcked: number;
  bytesSent: number;
  bytesReceived: number;
  retries: number;
  failures: UsageFailureCounts;
  samplesSetAside: number;
  samplesThinned: number;
  /** Seconds spent in each tracking mode. */
  secondsByMode: Partial<Record<Exclude<NativeTrackingMode, "off">, number>>;
};

/** Upload policy constants in effect on the phone, as reported by the native plugin. */
export type UsagePolicy = {
  emissionIntervalSeconds: 0 | 15 | 30 | null;
  maxBatchSize: number;
  maxQueueDepth: number;
  minEmissionIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
  minDistanceMeters: number;
  minBearingDistanceMeters: number;
  turnThresholdDegrees: number;
};

export type UsageLedger = {
  buckets: UsageLedgerBucket[];
  policy: UsagePolicy;
  estimate: UsageEstimate;
};

/**
 * The last read of the phone's counters and the level derived from it; `ledger` is `null` when
 * unavailable. `level` is the worst across the resources and `resource` the one it belongs to;
 * unset means Database I/O.
 */
export type UsageReading = { ledger: UsageLedger | null; level: UsageLevel | null; resource?: UsageResource };

/** Inputs for estimating GPS point storage from acknowledged points. */
export type UsageStorageModel = {
  bytesPerPoint: number;
  indexCopies: number;
};

/** Estimated, from the backend simulator: 242 B per stored GPS point plus about 171 B of index keys. */
export const USAGE_STORAGE_MODEL: UsageStorageModel = { bytesPerPoint: 242, indexCopies: 1.7 };

export const USAGE_LEVEL_COPY: Record<UsageLevel, { label: string; message: string }> = {
  ok: {
    label: "OK",
    message: "Estimated Database I/O is within the Free plan this month.",
  },
  warn: {
    label: "Warning",
    message: "Estimated Database I/O is past 70% of the Free plan, or on pace to pass it this month.",
  },
  critical: {
    label: "Critical",
    message: "Estimated Database I/O is past 90% of the Free plan. GPS uploads pause at 99%.",
  },
  paused: {
    label: "Uploads paused",
    message:
      "Estimated Database I/O reached 99% of the Free plan. GPS uploads are paused and points are saved on the phone until the month resets.",
  },
};

/** UTC start and end of a `YYYY-MM` month key, or `null` if the key is malformed. */
export function monthBoundsUtc(monthKey: string): { startMs: number; endMs: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { startMs: Date.UTC(year, monthIndex, 1), endMs: Date.UTC(year, monthIndex + 1, 1) };
}

/** Pace is not projected until this much has been counted; earlier it is mostly noise. */
export const MIN_PACE_ELAPSED_MS = 3 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Start of the hours in which the phone counted its uploads: the oldest bucket (later after a
 * reset), or the hour after the last bucket that accepted points without counting any upload,
 * which was recorded before this build counted uploads. `null` when there are no buckets.
 */
function uploadCountingStart(buckets: UsageLedgerBucket[]): number | null {
  if (buckets.length === 0) return null;
  let start = Math.min(...buckets.map((bucket) => bucket.hourStart));
  for (const bucket of buckets) {
    if (bucket.samplesAcked > 0 && bucket.uploads === 0) start = Math.max(start, bucket.hourStart + HOUR_MS);
  }
  return start;
}

/** The month's usage as estimated from the phone's upload count and `USAGE_GUARD`. */
export type UsageAssessment = {
  monthKey: string;
  uploads: number;
  bytes: number;
  limitBytes: number;
  percent: number;
  /** When the counted period starts: the UTC month start, or later when counting began later; `null` before any hour is counted. */
  countedFromMs: number | null;
  /** True when the count does not cover the whole month so far. */
  partial: boolean;
  /** Month-end percent at the counted rate; `null` until `MIN_PACE_ELAPSED_MS` has been counted. */
  pace: number | null;
  level: UsageLevel;
};

/**
 * Assesses the phone's ledger at `asOfMs` with the app's own guard, so it does not depend on the
 * phone having been given its limit. Pace is the counted rate (estimated bytes over the time since
 * counting began) projected over the full month. Paused comes from the phone: its estimate or its
 * publishing phase (`uploadsPaused`). Warn from 70 percent or pace over 100, critical from 90.
 */
export function assessUsage(ledger: UsageLedger, asOfMs: number, uploadsPaused: boolean): UsageAssessment | null {
  const bounds = monthBoundsUtc(ledger.estimate.monthKey);
  if (!bounds) return null;
  const bytes = ledger.estimate.uploads * USAGE_GUARD.bytesPerUpload;
  const limitBytes = USAGE_GUARD.monthlyLimitBytes;
  const percent = (bytes / limitBytes) * 100;
  const countingStart = uploadCountingStart(ledger.buckets);
  const countedFromMs = countingStart === null ? null : Math.max(bounds.startMs, countingStart);
  const countedMs = countedFromMs === null ? 0 : Math.min(asOfMs, bounds.endMs) - countedFromMs;
  const pace = countedMs >= MIN_PACE_ELAPSED_MS ? (percent * (bounds.endMs - bounds.startMs)) / countedMs : null;
  const level: UsageLevel = ledger.estimate.paused || uploadsPaused
    ? "paused"
    : percent >= CRITICAL_PERCENT
      ? "critical"
      : percent >= WARN_PERCENT || (pace !== null && pace > 100)
        ? "warn"
        : "ok";
  return {
    monthKey: ledger.estimate.monthKey,
    uploads: ledger.estimate.uploads,
    bytes,
    limitBytes,
    percent,
    countedFromMs,
    partial: countedFromMs === null || countedFromMs > bounds.startMs,
    pace,
    level,
  };
}

/** Key for remembering which usage toast was already shown this month. */
export function usageToastKey(monthKey: string, level: UsageLevel): string {
  return `${monthKey}:${level}`;
}

const WARNING_RANK: Partial<Record<UsageLevel, number>> = { warn: 1, critical: 2, paused: 3 };

/**
 * True when `level` is a warning above the last one toasted, where `lastToastKey`
 * is the stored `usageToastKey` (or `null`). A new month starts over.
 */
export function isUsageEscalation(lastToastKey: string | null, monthKey: string, level: UsageLevel): boolean {
  const rank = WARNING_RANK[level];
  if (rank === undefined) return false;
  if (lastToastKey === null) return true;
  const [lastMonth, lastLevel] = lastToastKey.split(":");
  return lastMonth !== monthKey || rank > (WARNING_RANK[lastLevel as UsageLevel] ?? 0);
}
