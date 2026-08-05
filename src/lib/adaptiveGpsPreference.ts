import { useSyncExternalStore } from "react";

export const ADAPTIVE_GPS_PREFERENCE_KEY = "tripcast.gps.adaptiveEnabled";

const listeners = new Set<() => void>();

export function getAdaptiveGpsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(ADAPTIVE_GPS_PREFERENCE_KEY);
    if (stored === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function setAdaptiveGpsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ADAPTIVE_GPS_PREFERENCE_KEY, String(enabled));
  } catch {
    // The in-memory notification still keeps the current view responsive.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ADAPTIVE_GPS_PREFERENCE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useAdaptiveGpsEnabled(): boolean {
  return useSyncExternalStore(subscribe, getAdaptiveGpsEnabled, () => true);
}
