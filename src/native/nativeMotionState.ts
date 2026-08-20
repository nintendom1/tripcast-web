import { useSyncExternalStore } from "react";

export type NativeMotionClassification =
  | "unknown"
  | "stationary"
  | "walking"
  | "running"
  | "cycling"
  | "automotive";

export type NativeMotionConfidence = "unknown" | "unavailable" | "low" | "medium" | "high";
export type NativeMotionPublishStatus = "idle" | "pending" | "publishing" | "acknowledged" | "failed";

export type NativeMotionState = {
  classification: NativeMotionClassification;
  confidence: NativeMotionConfidence;
  changedAt: number | null;
  publishStatus: NativeMotionPublishStatus;
  pendingClassification: NativeMotionClassification | null;
  publishFailureReason: string | null;
};

const INITIAL_STATE: NativeMotionState = {
  classification: "unknown",
  confidence: "unknown",
  changedAt: null,
  publishStatus: "idle",
  pendingClassification: null,
  publishFailureReason: null,
};

let state = INITIAL_STATE;
const listeners = new Set<() => void>();

export function getNativeMotionState(): NativeMotionState {
  return state;
}

export function setNativeMotionState(next: Partial<NativeMotionState>): void {
  const updated = { ...state, ...next };
  if (
    updated.classification === state.classification &&
    updated.confidence === state.confidence &&
    updated.changedAt === state.changedAt &&
    updated.publishStatus === state.publishStatus &&
    updated.pendingClassification === state.pendingClassification &&
    updated.publishFailureReason === state.publishFailureReason
  ) return;
  state = updated;
  listeners.forEach((listener) => listener());
}

export function resetNativeMotionState(): void {
  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
}

export function subscribeNativeMotionState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNativeMotionState(): NativeMotionState {
  return useSyncExternalStore(
    subscribeNativeMotionState,
    getNativeMotionState,
    getNativeMotionState,
  );
}
