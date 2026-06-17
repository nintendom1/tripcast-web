import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tripcast.liveTrail.fixOverlayEnabled";
const listeners = new Set<() => void>();

function readStored(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let cached: boolean = readStored();

export function getFixOverlayEnabled(): boolean {
  return cached;
}

export function setFixOverlayEnabled(enabled: boolean): void {
  if (cached === enabled) return;
  cached = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // no-op
  }
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useFixOverlayEnabled(): boolean {
  return useSyncExternalStore(subscribe, getFixOverlayEnabled, getFixOverlayEnabled);
}
