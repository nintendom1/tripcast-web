import { useSyncExternalStore } from "react";

export const STALE_BREADCRUMB_ALERT_KEY = "tripcast.gps.staleBreadcrumbAlertSeconds";
export type StaleBreadcrumbAlertSeconds = 0 | 120 | 180 | 300;

const listeners = new Set<() => void>();

export function getStaleBreadcrumbAlertSeconds(): StaleBreadcrumbAlertSeconds {
  try {
    const value = Number(localStorage.getItem(STALE_BREADCRUMB_ALERT_KEY) ?? "120");
    if (value === 0 || value === 120 || value === 180 || value === 300) return value;
  } catch {
    // Fall through to the reliability-first default.
  }
  return 120;
}

export function setStaleBreadcrumbAlertSeconds(value: StaleBreadcrumbAlertSeconds): void {
  try {
    localStorage.setItem(STALE_BREADCRUMB_ALERT_KEY, String(value));
  } catch {
    // The in-memory notification still keeps the current view responsive.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STALE_BREADCRUMB_ALERT_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useStaleBreadcrumbAlertSeconds(): StaleBreadcrumbAlertSeconds {
  return useSyncExternalStore(subscribe, getStaleBreadcrumbAlertSeconds, () => 120);
}
