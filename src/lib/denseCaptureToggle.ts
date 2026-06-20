import { useSyncExternalStore } from "react";

/**
 * Debug-only "Dense GPS capture" control. Separate from the Fix Overlay *view*
 * toggle (`fixOverlayToggle.ts`): the overlay renders accumulated dots cheaply,
 * while dense capture runs a battery-heavy second native watcher (small
 * distanceFilter) that produces the close-spaced stream the overlay visualizes.
 *
 * Because it drains battery and works in the background, it carries a selectable
 * auto-off timeout (0 = never) and an `enabledAt` stamp so the UI can count down
 * and TripMap can auto-disable it.
 */

const ENABLED_KEY = "tripcast.liveTrail.denseCaptureEnabled";
const TIMEOUT_KEY = "tripcast.liveTrail.denseCaptureTimeoutMinutes";
const ENABLED_AT_KEY = "tripcast.liveTrail.denseCaptureEnabledAt";

// Selectable auto-off durations (minutes). 0 = no auto-off.
export const DENSE_CAPTURE_TIMEOUT_OPTIONS = [15, 30, 60, 0] as const;
const DEFAULT_TIMEOUT_MINUTES = 30;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((cb) => cb());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function readBool(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function readNumber(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

let cachedEnabled = readBool(ENABLED_KEY);
let cachedTimeoutMinutes = readNumber(TIMEOUT_KEY, DEFAULT_TIMEOUT_MINUTES);
let cachedEnabledAt: number | null = (() => {
  const n = readNumber(ENABLED_AT_KEY, 0);
  return n > 0 ? n : null;
})();

function writeStorage(key: string, value: string | null) {
  if (typeof localStorage === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable — debug control is best-effort
  }
}

export function getDenseCaptureEnabled(): boolean {
  return cachedEnabled;
}

export function setDenseCaptureEnabled(enabled: boolean): void {
  if (cachedEnabled === enabled) return;
  cachedEnabled = enabled;
  writeStorage(ENABLED_KEY, enabled ? "true" : "false");
  cachedEnabledAt = enabled ? Date.now() : null;
  writeStorage(ENABLED_AT_KEY, cachedEnabledAt === null ? null : String(cachedEnabledAt));
  emit();
}

export function getDenseCaptureTimeoutMinutes(): number {
  return cachedTimeoutMinutes;
}

export function setDenseCaptureTimeoutMinutes(minutes: number): void {
  if (cachedTimeoutMinutes === minutes) return;
  cachedTimeoutMinutes = minutes;
  writeStorage(TIMEOUT_KEY, String(minutes));
  emit();
}

export function getDenseCaptureEnabledAt(): number | null {
  return cachedEnabledAt;
}

/**
 * Whether the auto-off deadline has passed. False when disabled or when the
 * timeout is 0 (no auto-off).
 */
export function isDenseCaptureExpired(nowMs: number): boolean {
  if (!cachedEnabled || cachedTimeoutMinutes <= 0 || cachedEnabledAt === null) return false;
  return nowMs - cachedEnabledAt >= cachedTimeoutMinutes * 60_000;
}

export function useDenseCaptureEnabled(): boolean {
  return useSyncExternalStore(subscribe, getDenseCaptureEnabled, getDenseCaptureEnabled);
}

export function useDenseCaptureTimeoutMinutes(): number {
  return useSyncExternalStore(subscribe, getDenseCaptureTimeoutMinutes, getDenseCaptureTimeoutMinutes);
}

export function useDenseCaptureEnabledAt(): number | null {
  return useSyncExternalStore(subscribe, getDenseCaptureEnabledAt, getDenseCaptureEnabledAt);
}
