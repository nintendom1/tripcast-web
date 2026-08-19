import { useSyncExternalStore } from "react";

export type NativeCaptureReadiness = "idle" | "starting" | "ready" | "degraded";
export type NativeActivityStatus =
  | "idle"
  | "created"
  | "reused"
  | "disabled"
  | "unsupported"
  | "failed";

export type NativeReadinessState = {
  captureReadiness: NativeCaptureReadiness;
  activityStatus: NativeActivityStatus;
  failureReason: string | null;
  queueRevision: number;
};

const INITIAL_STATE: NativeReadinessState = {
  captureReadiness: "idle",
  activityStatus: "idle",
  failureReason: null,
  queueRevision: 0,
};

let state = INITIAL_STATE;
const listeners = new Set<() => void>();

export function getNativeReadinessState(): NativeReadinessState {
  return state;
}

export function setNativeReadinessState(next: Partial<NativeReadinessState>): void {
  const updated = { ...state, ...next };
  if (
    updated.captureReadiness === state.captureReadiness &&
    updated.activityStatus === state.activityStatus &&
    updated.failureReason === state.failureReason &&
    updated.queueRevision === state.queueRevision
  ) return;
  state = updated;
  listeners.forEach((listener) => listener());
}

export function markNativeCaptureStarting(): void {
  setNativeReadinessState({ captureReadiness: "starting", failureReason: null });
}

export function resetNativeReadinessState(): void {
  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
}

export function useNativeReadinessState(): NativeReadinessState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getNativeReadinessState,
    getNativeReadinessState,
  );
}
