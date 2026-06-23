import { useSyncExternalStore } from "react";

/**
 * Per-device, per-month estimate of Convex **image-serving** egress. After the
 * map proxy removal, story images are the only meaningful Convex egress; this
 * sums the served byte size (from `_storage` metadata) of each distinct image
 * the device has loaded this month. It's an estimate — deliberately deduped per
 * image (a cache hit on a second view doesn't re-egress) and per device. The
 * authoritative project total lives in the Convex dashboard.
 */

const STORAGE_KEY = "tripcast.egressMeter.v1";

type MeterState = { month: string; sizes: Record<string, number> };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function readStored(): MeterState {
  const fresh: MeterState = { month: currentMonth(), sizes: {} };
  if (typeof localStorage === "undefined") return fresh;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as MeterState;
    if (typeof parsed?.month !== "string" || typeof parsed?.sizes !== "object") return fresh;
    return parsed;
  } catch {
    return fresh;
  }
}

function rollToCurrentMonth(state: MeterState): MeterState {
  const month = currentMonth();
  return state.month === month ? state : { month, sizes: {} };
}

let cached: MeterState = rollToCurrentMonth(readStored());
const listeners = new Set<() => void>();

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // best-effort; the estimate isn't critical
  }
}

function emit() {
  listeners.forEach((cb) => cb());
}

export function recordImageSizes(entries: ReadonlyArray<{ imageId: string; size: number }>): void {
  cached = rollToCurrentMonth(cached);
  let changed = false;
  for (const { imageId, size } of entries) {
    if (cached.sizes[imageId] === undefined && Number.isFinite(size) && size > 0) {
      cached.sizes[imageId] = size;
      changed = true;
    }
  }
  if (changed) {
    persist();
    emit();
  }
}

export function getRecordedImageIds(): Set<string> {
  cached = rollToCurrentMonth(cached);
  return new Set(Object.keys(cached.sizes));
}

export function getEgressEstimateBytes(): number {
  cached = rollToCurrentMonth(cached);
  let total = 0;
  for (const size of Object.values(cached.sizes)) total += size;
  return total;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useEgressEstimateBytes(): number {
  return useSyncExternalStore(subscribe, getEgressEstimateBytes, getEgressEstimateBytes);
}
