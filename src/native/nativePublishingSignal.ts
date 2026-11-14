// Module-level channel between TripMap and the headless LivePublishingBridge (contract package WC; final API).
//
// After W2 moves the native configure effect out of TripMap, the two no longer share component state. W2 moves
// TripMap's `nativeRetryNonce` state onto the retry nonce here (TripMap's Retry buttons call
// `requestNativePublishingRetry`, the bridge's configure effect depends on the nonce) and TripMap's
// `nativePublishingReadyRef` onto the readiness flag (the bridge writes it, TripMap's publisher reads it).
// Nothing uses this module yet.

type Listener = () => void;

let retryNonce = 0;
let ready = false;
const listeners = new Set<Listener>();

/** Asks the bridge to configure native publishing again (bumps the retry nonce and notifies subscribers). */
export function requestNativePublishingRetry(): void {
  retryNonce += 1;
  for (const listener of [...listeners]) listener();
}

/** Subscribes to retry-nonce changes; returns the unsubscribe function. For `useSyncExternalStore`. */
export function subscribeNativePublishingRetry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current retry nonce (starts at 0, +1 per retry request). Snapshot for `useSyncExternalStore`. */
export function getNativePublishingRetryNonce(): number {
  return retryNonce;
}

/**
 * Records whether native publishing is configured and usable (the bridge sets it after `configure()` succeeds and
 * clears it on failure, non-Traveler roles or a missing endpoint).
 */
export function setNativePublishingReady(value: boolean): void {
  ready = value;
}

/** Whether native publishing is configured; TripMap's JS publisher reads it before deferring to native. */
export function isNativePublishingReady(): boolean {
  return ready;
}
