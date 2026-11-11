import { useSyncExternalStore } from "react";
import {
  foldPoints,
  newDatabaseBaseline,
  newFileBaseline,
  type DbBaseline,
  type FileBaseline,
  type UsageBaselineKind,
  type UsageBaselines,
} from "./usageResources";
import type { UsageLedger } from "./usageWarning";

/**
 * Per-device storage of what the Convex Usage screen needs to estimate the two storage resources:
 * the dashboard figures the Traveler entered, with the points and photo bytes this phone added
 * after them, and a separate count of photo bytes uploaded this UTC month for when there is no
 * figure. Estimates only; the authoritative totals live in the Convex dashboard.
 */

const STORAGE_KEY = "tripcast.usageBaselines.v1";

type StoredState = { baselines: UsageBaselines; fileMonth: { month: string; bytes: number } };

export type UsageBaselinesSnapshot = { baselines: UsageBaselines; fileBytesAddedThisMonth: number };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseDatabase(value: unknown): DbBaseline | undefined {
  const v = value as Partial<DbBaseline> | null | undefined;
  return v && isCount(v.bytes) && isCount(v.enteredAtMs) && isCount(v.foldedThroughHourMs) && isCount(v.foldedPoints)
    ? { bytes: v.bytes, enteredAtMs: v.enteredAtMs, foldedThroughHourMs: v.foldedThroughHourMs, foldedPoints: v.foldedPoints }
    : undefined;
}

function parseFile(value: unknown): FileBaseline | undefined {
  const v = value as Partial<FileBaseline> | null | undefined;
  return v && isCount(v.bytes) && isCount(v.enteredAtMs) && isCount(v.addedBytes)
    ? { bytes: v.bytes, enteredAtMs: v.enteredAtMs, addedBytes: v.addedBytes }
    : undefined;
}

function readStored(): StoredState {
  const fresh: StoredState = { baselines: {}, fileMonth: { month: currentMonth(), bytes: 0 } };
  if (typeof localStorage === "undefined") return fresh;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<StoredState> | null;
    const month = parsed?.fileMonth?.month;
    return {
      baselines: { database: parseDatabase(parsed?.baselines?.database), file: parseFile(parsed?.baselines?.file) },
      fileMonth:
        typeof month === "string" && isCount(parsed?.fileMonth?.bytes)
          ? { month, bytes: parsed.fileMonth.bytes }
          : fresh.fileMonth,
    };
  } catch {
    return fresh;
  }
}

function rollToCurrentMonth(state: StoredState): StoredState {
  const month = currentMonth();
  return state.fileMonth.month === month ? state : { ...state, fileMonth: { month, bytes: 0 } };
}

let cached: StoredState = rollToCurrentMonth(readStored());
let snapshot: UsageBaselinesSnapshot | null = null;
const listeners = new Set<() => void>();

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // best-effort; the estimate isn't critical
  }
}

function commit(next: StoredState) {
  cached = next;
  snapshot = null;
  persist();
  listeners.forEach((cb) => cb());
}

/** The current baselines; the same object until something changes, so it can back `useSyncExternalStore`. */
export function getUsageBaselines(): UsageBaselinesSnapshot {
  const rolled = rollToCurrentMonth(cached);
  if (rolled !== cached) {
    cached = rolled;
    snapshot = null;
  }
  snapshot ??= { baselines: cached.baselines, fileBytesAddedThisMonth: cached.fileMonth.bytes };
  return snapshot;
}

/** Stores the figure the Traveler read off the Convex dashboard, replacing any earlier one. */
export function saveUsageBaseline(kind: UsageBaselineKind, bytes: number, nowMs: number = Date.now()): void {
  if (!Number.isFinite(bytes) || bytes < 0) return;
  const baselines: UsageBaselines =
    kind === "database"
      ? { ...cached.baselines, database: newDatabaseBaseline(bytes, nowMs) }
      : { ...cached.baselines, file: newFileBaseline(bytes, nowMs) };
  commit({ ...rollToCurrentMonth(cached), baselines });
}

/** Forgets both figures, for when the trip's data is deleted. The photo bytes uploaded this month stay. */
export function clearUsageBaselines(): void {
  commit({ ...rollToCurrentMonth(cached), baselines: {} });
}

/** Counts bytes of a photo this phone has just uploaded; call it only once the upload has succeeded. */
export function recordUploadedFileBytes(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const state = rollToCurrentMonth(cached);
  const file = state.baselines.file;
  commit({
    baselines: file ? { ...state.baselines, file: { ...file, addedBytes: file.addedBytes + bytes } } : state.baselines,
    fileMonth: { month: state.fileMonth.month, bytes: state.fileMonth.bytes + bytes },
  });
}

/**
 * Folds the phone's counters into the database baseline (see `foldPoints`) and returns the result.
 * Call it on every read of the ledger, and with `closeOpenHour` just before the counters are reset.
 */
export function foldUsageBaselines(
  ledger: UsageLedger,
  nowMs: number,
  opts?: { closeOpenHour?: boolean },
): UsageBaselinesSnapshot {
  const database = cached.baselines.database;
  if (database) {
    const folded = foldPoints(database, ledger, nowMs, opts);
    if (folded !== database) commit({ ...rollToCurrentMonth(cached), baselines: { ...cached.baselines, database: folded } });
  }
  return getUsageBaselines();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useUsageBaselines(): UsageBaselinesSnapshot {
  return useSyncExternalStore(subscribe, getUsageBaselines, getUsageBaselines);
}
