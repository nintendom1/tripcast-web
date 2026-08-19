import { useSyncExternalStore } from "react";

export const LIVE_GPS_UPLOAD_INTERVAL_KEY = "tripcast.gps.uploadIntervalSeconds";
export type LiveGpsUploadIntervalSeconds = 0 | 15 | 30;

const listeners = new Set<() => void>();

export function getLiveGpsUploadIntervalSeconds(): LiveGpsUploadIntervalSeconds {
  try {
    const value = Number(localStorage.getItem(LIVE_GPS_UPLOAD_INTERVAL_KEY) ?? "15");
    if (value === 0 || value === 15 || value === 30) return value;
  } catch {
    // Fall through to the balanced default.
  }
  return 15;
}

export function setLiveGpsUploadIntervalSeconds(value: LiveGpsUploadIntervalSeconds): void {
  try {
    localStorage.setItem(LIVE_GPS_UPLOAD_INTERVAL_KEY, String(value));
  } catch {
    // The in-memory notification still keeps the current view responsive.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIVE_GPS_UPLOAD_INTERVAL_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useLiveGpsUploadIntervalSeconds(): LiveGpsUploadIntervalSeconds {
  return useSyncExternalStore(subscribe, getLiveGpsUploadIntervalSeconds, () => 15);
}
