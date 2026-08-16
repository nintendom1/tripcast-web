import { useSyncExternalStore } from "react";

export type NativePublishingPhase =
  | "idle"
  | "healthy"
  | "offline"
  | "syncing"
  | "retrying"
  | "storage-error";

export type NativePublishingState = {
  phase: NativePublishingPhase;
  queueDepth: number;
  breadcrumbQueueDepth: number;
  capacityReached: boolean;
  completedDrainCount: number | null;
};

const INITIAL_STATE: NativePublishingState = {
  phase: "idle",
  queueDepth: 0,
  breadcrumbQueueDepth: 0,
  capacityReached: false,
  completedDrainCount: null,
};

let state = INITIAL_STATE;
const listeners = new Set<() => void>();

export function getNativePublishingState(): NativePublishingState {
  return state;
}

export function setNativePublishingState(next: Partial<NativePublishingState>): void {
  const updated = { ...state, ...next };
  if (
    updated.phase === state.phase &&
    updated.queueDepth === state.queueDepth &&
    updated.breadcrumbQueueDepth === state.breadcrumbQueueDepth &&
    updated.capacityReached === state.capacityReached &&
    updated.completedDrainCount === state.completedDrainCount
  ) {
    return;
  }
  state = updated;
  listeners.forEach((listener) => listener());
}

export function clearCompletedNativeDrain(): void {
  setNativePublishingState({ completedDrainCount: null });
}

export function resetNativePublishingState(): void {
  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
}

export function subscribeNativePublishingState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNativePublishingState(): NativePublishingState {
  return useSyncExternalStore(
    subscribeNativePublishingState,
    getNativePublishingState,
    getNativePublishingState,
  );
}
