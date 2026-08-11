import { useSyncExternalStore } from "react";

export type NativeTrackingMode = "off" | "precise" | "power-saving" | "legacy";

export type NativeTrackingState = {
  mode: NativeTrackingMode;
  changedAt: number;
};

let state: NativeTrackingState = { mode: "off", changedAt: Date.now() };
const listeners = new Set<() => void>();

export function getNativeTrackingState(): NativeTrackingState {
  return state;
}

export function setNativeTrackingMode(mode: NativeTrackingMode, changedAt = Date.now()): void {
  if (state.mode === mode && state.changedAt === changedAt) return;
  state = { mode, changedAt };
  listeners.forEach((listener) => listener());
}

export function subscribeNativeTrackingState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNativeTrackingState(): NativeTrackingState {
  return useSyncExternalStore(
    subscribeNativeTrackingState,
    getNativeTrackingState,
    getNativeTrackingState,
  );
}
