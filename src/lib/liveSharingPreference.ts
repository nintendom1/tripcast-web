import { useSyncExternalStore } from "react";

export const LIVE_SHARING_PREFERENCE_KEY = "tripcast.live-sharing.enabled";

const listeners = new Set<() => void>();
let memoryValue: boolean | null = null;

export function getLiveSharingEnabled(): boolean {
  try {
    const stored = localStorage.getItem(LIVE_SHARING_PREFERENCE_KEY);
    memoryValue = stored === "true";
    return memoryValue;
  } catch {
    return memoryValue ?? false;
  }
}

export function setLiveSharingEnabled(enabled: boolean): void {
  memoryValue = enabled;
  try {
    localStorage.setItem(LIVE_SHARING_PREFERENCE_KEY, String(enabled));
  } catch {
    // The in-memory notification still keeps mounted views synchronized.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIVE_SHARING_PREFERENCE_KEY) {
      memoryValue = event.newValue === "true";
      listener();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function useLiveSharingEnabled(): boolean {
  return useSyncExternalStore(subscribe, getLiveSharingEnabled, () => false);
}
