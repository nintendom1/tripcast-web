import {
  assessUsage,
  isUsageEscalation,
  USAGE_LEVEL_COPY,
  type UsageLedger,
  type UsageLedgerBucket,
  type UsageLevel,
  type UsageStorageModel,
} from "./usageWarning";

/**
 * The five Convex resources the Usage screen meters against the Free plan: the shapes, the
 * allowances, the phone's estimate of each, and the dashboard baselines that storage needs.
 *
 * Everything here is pure. Callers pass the time in; nothing reads the clock or storage.
 */

export type UsageResource = "functionCalls" | "databaseIo" | "databaseStorage" | "fileStorage" | "dataEgress";

/** The order the screen lists them in. */
export const USAGE_RESOURCES: UsageResource[] = [
  "functionCalls",
  "databaseIo",
  "databaseStorage",
  "fileStorage",
  "dataEgress",
];

export const USAGE_RESOURCE_LABELS: Record<UsageResource, string> = {
  functionCalls: "Function Calls",
  databaseIo: "Database I/O",
  databaseStorage: "Database Storage",
  fileStorage: "File Storage",
  dataEgress: "Data Egress",
};

export type UsageAllowance = {
  unit: "calls" | "bytes";
  /** `month`: resets with the UTC month. `total`: everything stored, across months. */
  period: "month" | "total";
  amount: number;
};

/** Free plan allowances; GB is 10^9 bytes. */
export const USAGE_ALLOWANCES: Record<UsageResource, UsageAllowance> = {
  functionCalls: { unit: "calls", period: "month", amount: 1_000_000 },
  databaseIo: { unit: "bytes", period: "month", amount: 1_000_000_000 },
  databaseStorage: { unit: "bytes", period: "total", amount: 500_000_000 },
  fileStorage: { unit: "bytes", period: "total", amount: 1_000_000_000 },
  dataEgress: { unit: "bytes", period: "month", amount: 1_000_000_000 },
};

/**
 * Estimated; Convex function calls per successful GPS upload, from the backend simulator
 * (119,040 calls per 72,000 uploads, about 1.65). Update when that figure changes.
 */
export const FUNCTION_CALLS_PER_UPLOAD = 1.65;

/** Same thresholds as `usageWarning.ts`, which does not export them. */
const WARN_PERCENT = 70;
const CRITICAL_PERCENT = 90;

const HOUR_MS = 60 * 60 * 1000;

/** A storage figure the Traveler read off the Convex dashboard, and what this phone added after it. */
export type DbBaseline = { bytes: number; enteredAtMs: number; foldedThroughHourMs: number; foldedPoints: number };
export type FileBaseline = { bytes: number; enteredAtMs: number; addedBytes: number };
export type UsageBaselines = { database?: DbBaseline; file?: FileBaseline };
export type UsageBaselineKind = "database" | "file";

function hourStartOf(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** Counting starts at the entry hour; points accepted earlier in that hour may already be in the figure. */
export function newDatabaseBaseline(bytes: number, nowMs: number): DbBaseline {
  return { bytes, enteredAtMs: nowMs, foldedThroughHourMs: hourStartOf(nowMs), foldedPoints: 0 };
}

export function newFileBaseline(bytes: number, nowMs: number): FileBaseline {
  return { bytes, enteredAtMs: nowMs, addedBytes: 0 };
}

function sumAcked(buckets: UsageLedgerBucket[], fromMs: number, beforeMs: number): number {
  let points = 0;
  for (const bucket of buckets) {
    if (bucket.hourStart >= fromMs && bucket.hourStart < beforeMs) points += bucket.samplesAcked;
  }
  return points;
}

/**
 * Moves the points accepted in finished hours into `foldedPoints` and advances the watermark, so
 * they stay counted after the phone drops old hourly buckets or the counters are reset. The open
 * hour is left alone because it is still growing; `closeOpenHour` folds it too, for just before a
 * reset. Points accepted after such a reset in the same hour fall behind the watermark and are not
 * counted.
 */
export function foldPoints(
  baseline: DbBaseline,
  ledger: UsageLedger,
  nowMs: number,
  opts?: { closeOpenHour?: boolean },
): DbBaseline {
  const currentHour = hourStartOf(nowMs);
  // More than the closed open hour ahead means the clock was set ahead and has gone back: pull the
  // watermark back so growth continues. This may recount up to one hour (errs high), which is accepted.
  const watermark = baseline.foldedThroughHourMs > currentHour + HOUR_MS ? currentHour : baseline.foldedThroughHourMs;
  const throughMs = Math.max(watermark, opts?.closeOpenHour ? currentHour + HOUR_MS : currentHour);
  if (throughMs === baseline.foldedThroughHourMs) return baseline;
  return {
    ...baseline,
    foldedPoints: baseline.foldedPoints + sumAcked(ledger.buckets, watermark, throughMs),
    foldedThroughHourMs: throughMs,
  };
}

/** Points accepted since the baseline: the folded total plus the hours not folded yet, derived live. */
export function pointsSinceBaseline(baseline: DbBaseline, ledger: UsageLedger, nowMs: number): number {
  return baseline.foldedPoints + sumAcked(ledger.buckets, baseline.foldedThroughHourMs, nowMs + 1);
}

const DASHBOARD_UNIT_BYTES = { MB: 1_000_000, GB: 1_000_000_000 } as const;
export type DashboardUnit = keyof typeof DASHBOARD_UNIT_BYTES;

/** Bytes for a dashboard figure typed as a plain decimal number in `unit`, or `null` if it is not one. */
export function parseDashboardFigure(text: string, unit: DashboardUnit): number | null {
  const trimmed = text.trim();
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) return null;
  const bytes = Number(trimmed) * DASHBOARD_UNIT_BYTES[unit];
  return Number.isFinite(bytes) ? Math.round(bytes) : null;
}

/** Why a resource has no estimate. */
export type ResourceUnavailable = "loading" | "no-counters" | "unreadable-month" | "no-model";

export type ResourceAssessment = {
  resource: UsageResource;
  label: string;
  allowance: UsageAllowance;
  /** Counted against the allowance; for a storage row with no baseline, only what this phone added. `null` when not estimated. */
  amount: number | null;
  percent: number | null;
  /** `null` when there is no estimate, and for a storage row with no baseline. */
  level: UsageLevel | null;
  unavailable: ResourceUnavailable | null;
  /** Storage rows only. */
  baseline?: { bytes: number; enteredAtMs: number } | null;
  /** Storage rows only: bytes this phone added since the baseline, or this month when there is none. */
  addedBytes?: number | null;
};

export type ResourceInputs = {
  /** `undefined` while loading; `null` when this device has no counters. */
  ledger: UsageLedger | null | undefined;
  nowMs: number;
  uploadsPaused: boolean;
  baselines?: UsageBaselines;
  /** Bytes of photos this phone uploaded this month. */
  fileBytesAddedThisMonth?: number;
  photoEgressBytes: number;
  storageModel: UsageStorageModel | null;
};

function levelForPercent(percent: number): UsageLevel {
  return percent >= CRITICAL_PERCENT ? "critical" : percent >= WARN_PERCENT ? "warn" : "ok";
}

function monthStartOf(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** Points accepted this month, counting only hours the phone has buckets for. */
function pointsThisMonth(ledger: UsageLedger, nowMs: number): number {
  return sumAcked(ledger.buckets, monthStartOf(nowMs), nowMs + 1);
}

function row(
  resource: UsageResource,
  amount: number | null,
  level: UsageLevel | null,
  unavailable: ResourceUnavailable | null,
  extra?: Pick<ResourceAssessment, "baseline" | "addedBytes">,
): ResourceAssessment {
  const allowance = USAGE_ALLOWANCES[resource];
  return {
    resource,
    label: USAGE_RESOURCE_LABELS[resource],
    allowance,
    amount,
    percent: amount === null ? null : (amount / allowance.amount) * 100,
    level,
    unavailable,
    ...extra,
  };
}

function ledgerUnavailable(ledger: UsageLedger | null | undefined): ResourceUnavailable | null {
  return ledger === undefined ? "loading" : ledger === null ? "no-counters" : null;
}

function storageRow(
  resource: "databaseStorage" | "fileStorage",
  baseline: { bytes: number; enteredAtMs: number } | undefined,
  addedBytes: number | null,
  unavailable: ResourceUnavailable | null,
): ResourceAssessment {
  if (addedBytes === null) return row(resource, null, null, unavailable, { baseline: baseline ?? null, addedBytes });
  if (!baseline) return row(resource, addedBytes, null, null, { baseline: null, addedBytes });
  const amount = baseline.bytes + addedBytes;
  const { amount: allowance } = USAGE_ALLOWANCES[resource];
  return row(resource, amount, levelForPercent((amount / allowance) * 100), null, {
    baseline: { bytes: baseline.bytes, enteredAtMs: baseline.enteredAtMs },
    addedBytes,
  });
}

/**
 * Assesses the five resources, in `USAGE_RESOURCES` order. Another resource at 100 percent is
 * critical; only Database I/O has month-end pace and a paused level. A storage row has no level
 * until the Traveler has entered the dashboard figure.
 */
export function assessResources(inputs: ResourceInputs): ResourceAssessment[] {
  const { ledger, nowMs, uploadsPaused, baselines, photoEgressBytes, storageModel } = inputs;
  const counted = ledger ?? null;
  const noCounters = ledgerUnavailable(ledger);

  const usage = counted ? assessUsage(counted, nowMs, uploadsPaused) : null;
  // Uploads are counted for the month in the phone's estimate; without a readable month there is no estimate.
  const functionCalls = counted && usage
    ? meteredRow("functionCalls", counted.estimate.uploads * FUNCTION_CALLS_PER_UPLOAD)
    : row("functionCalls", null, null, noCounters ?? "unreadable-month");
  const databaseIo = usage
    ? row("databaseIo", usage.bytes, usage.level, null)
    : row("databaseIo", null, null, noCounters ?? "unreadable-month");

  const points = counted
    ? baselines?.database
      ? pointsSinceBaseline(baselines.database, counted, nowMs)
      : pointsThisMonth(counted, nowMs)
    : null;
  const databaseGrowth = points !== null && storageModel ? points * storageModel.bytesPerPoint * storageModel.indexCopies : null;

  const file = baselines?.file;
  return [
    functionCalls,
    databaseIo,
    storageRow("databaseStorage", baselines?.database, databaseGrowth, noCounters ?? (storageModel ? null : "no-model")),
    storageRow("fileStorage", file, file ? file.addedBytes : (inputs.fileBytesAddedThisMonth ?? 0), null),
    meteredRow("dataEgress", photoEgressBytes),
  ];
}

function meteredRow(resource: UsageResource, amount: number): ResourceAssessment {
  return row(resource, amount, levelForPercent((amount / USAGE_ALLOWANCES[resource].amount) * 100), null);
}

const LEVEL_SEVERITY: Record<UsageLevel, number> = { ok: 0, warn: 1, critical: 2, paused: 3 };

/** Ties go to Database I/O, then to the screen's order. */
const TIE_ORDER: UsageResource[] = ["databaseIo", "functionCalls", "databaseStorage", "fileStorage", "dataEgress"];

export type ResourceLevel = { resource: UsageResource; level: UsageLevel };

function mostSevere(candidates: ResourceLevel[]): ResourceLevel | null {
  let best: ResourceLevel | null = null;
  for (const candidate of candidates) {
    if (
      best === null ||
      LEVEL_SEVERITY[candidate.level] > LEVEL_SEVERITY[best.level] ||
      (LEVEL_SEVERITY[candidate.level] === LEVEL_SEVERITY[best.level] &&
        TIE_ORDER.indexOf(candidate.resource) < TIE_ORDER.indexOf(best.resource))
    ) {
      best = candidate;
    }
  }
  return best;
}

function withLevel(rows: ResourceAssessment[]): ResourceLevel[] {
  return rows.flatMap((assessed) => (assessed.level === null ? [] : [{ resource: assessed.resource, level: assessed.level }]));
}

/** The worst level across the resources and the resource it belongs to; `null` when none has a level. */
export function worstResourceLevel(rows: ResourceAssessment[]): ResourceLevel | null {
  return mostSevere(withLevel(rows));
}

/**
 * The single escalation to toast for this read: the most severe resource whose level is a warning
 * above the last one toasted for it. `lastToastKeyFor` returns that resource's stored
 * `usageToastKey`, or `null`. The others stay pending for a later read.
 */
export function pendingResourceEscalation(
  rows: ResourceAssessment[],
  monthKey: string,
  lastToastKeyFor: (resource: UsageResource) => string | null,
): ResourceLevel | null {
  return mostSevere(
    withLevel(rows).filter(({ resource, level }) => isUsageEscalation(lastToastKeyFor(resource), monthKey, level)),
  );
}

/** Copy for a resource's level; Database I/O (or no resource) keeps `USAGE_LEVEL_COPY`. */
export function usageResourceCopy(
  resource: UsageResource | undefined,
  level: UsageLevel,
): { label: string; message: string } {
  if (resource === undefined || resource === "databaseIo") return USAGE_LEVEL_COPY[level];
  const name = USAGE_RESOURCE_LABELS[resource];
  if (level === "ok") return { label: USAGE_LEVEL_COPY.ok.label, message: `Estimated ${name} is within the Free plan.` };
  if (level === "warn") return { label: USAGE_LEVEL_COPY.warn.label, message: `Estimated ${name} is past ${WARN_PERCENT}% of the Free plan.` };
  return { label: USAGE_LEVEL_COPY.critical.label, message: `Estimated ${name} is past ${CRITICAL_PERCENT}% of the Free plan.` };
}
