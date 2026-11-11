import { useSyncExternalStore } from "react";

// Module-level channel between TripMap and the headless LivePublishingBridge (contract package WC; W2 adds the
// revoke and stop-notice channels below the original API).
//
// The native configure effect lives in the bridge, so the two no longer share component state: TripMap's Retry
// buttons call `requestNativePublishingRetry` (the bridge's configure effect depends on the nonce), the bridge writes
// the readiness flag and TripMap's JS publisher reads it. The phone's `gps:native-publish:revoked` event reaches the
// bridge through `reportNativePublishingRevoked`, and the bridge hands TripMap one notice per stopped session. The
// bridge also publishes the trip tags it configures (`setNativePublishingTags`): TripMap's JS publisher sends the same
// tags, and the usage estimates use the same bytes per upload (`isNativePublishingTagsSent`).

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

/** Why the phone stopped a live session by itself (`gps:native-publish:revoked`). */
export type NativePublishingRevoke = {
  /** `trip-changed`: the shared trip's epoch moved on; `tags-introduced`: tags appeared for an untagged session. */
  reason: "trip-changed" | "tags-introduced";
  /** The epoch the phone was configured with or the server reported, when known. */
  epoch?: number;
};

type RevokeListener = (revoke: NativePublishingRevoke) => void;
const revokeListeners = new Set<RevokeListener>();

/** Called by the native location manager when the phone emits `gps:native-publish:revoked`. */
export function reportNativePublishingRevoked(revoke: NativePublishingRevoke): void {
  for (const listener of [...revokeListeners]) listener(revoke);
}

/** Subscribes to phone revocations (the bridge); returns the unsubscribe function. */
export function subscribeNativePublishingRevoked(listener: RevokeListener): () => void {
  revokeListeners.add(listener);
  return () => {
    revokeListeners.delete(listener);
  };
}

/** A notice that live sharing was stopped by a trip change, not by the Traveler. */
export type LiveSharingStopNotice = { id: number; message: string };

let stopNotice: LiveSharingStopNotice | null = null;
let stopNoticeId = 0;
const stopNoticeListeners = new Set<Listener>();

/** Posts the notice TripMap shows once (the bridge calls it once per stopped session). */
export function reportLiveSharingStopped(message: string): void {
  stopNoticeId += 1;
  stopNotice = { id: stopNoticeId, message };
  for (const listener of [...stopNoticeListeners]) listener();
}

/** Subscribes to stop notices; returns the unsubscribe function. For `useSyncExternalStore`. */
export function subscribeLiveSharingStopped(listener: Listener): () => void {
  stopNoticeListeners.add(listener);
  return () => {
    stopNoticeListeners.delete(listener);
  };
}

/** The latest notice not yet shown, or `null`. Snapshot for `useSyncExternalStore`. */
export function getLiveSharingStopNotice(): LiveSharingStopNotice | null {
  return stopNotice;
}

/** Marks notice `id` as shown, so a later mount does not show it again. */
export function clearLiveSharingStopNotice(id: number): void {
  if (stopNotice?.id === id) stopNotice = null;
}

let tagsSent = false;
const tagsSentListeners = new Set<Listener>();

/** The bridge records whether it configures the phone with trip tags (and the tagged usage guard). */
export function setNativePublishingTagsSent(value: boolean): void {
  if (tagsSent === value) return;
  tagsSent = value;
  for (const listener of [...tagsSentListeners]) listener();
}

/** Whether the phone is configured with trip tags; `false` until the bridge says otherwise. */
export function isNativePublishingTagsSent(): boolean {
  return tagsSent;
}

function subscribeNativePublishingTagsSent(listener: Listener): () => void {
  tagsSentListeners.add(listener);
  return () => {
    tagsSentListeners.delete(listener);
  };
}

/** `isNativePublishingTagsSent` as a React value that updates when the bridge's mode changes. */
export function useNativePublishingTagsSent(): boolean {
  return useSyncExternalStore(subscribeNativePublishingTagsSent, isNativePublishingTagsSent, isNativePublishingTagsSent);
}

/** The capture trip the bridge configures the phone with (the shared current trip, or its last known identity). */
export type NativePublishingTags = { tripId: string; publishingEpoch: number; tripTitle: string };

let publishingTags: NativePublishingTags | null = null;
const publishingTagsListeners = new Set<Listener>();

/** The bridge publishes its tags (`null`: untagged); compared by value, so an equal value notifies nobody. */
export function setNativePublishingTags(next: NativePublishingTags | null): void {
  const same =
    next === publishingTags ||
    (next !== null &&
      publishingTags !== null &&
      next.tripId === publishingTags.tripId &&
      next.publishingEpoch === publishingTags.publishingEpoch &&
      next.tripTitle === publishingTags.tripTitle);
  if (!same) {
    publishingTags = next;
    for (const listener of [...publishingTagsListeners]) listener();
  }
  setNativePublishingTagsSent(next !== null);
}

/** The tags the bridge configures, or `null`. Snapshot for `useSyncExternalStore` (stable until they change). */
export function getNativePublishingTags(): NativePublishingTags | null {
  return publishingTags;
}

/** Subscribes to tag changes; returns the unsubscribe function. */
export function subscribeNativePublishingTags(listener: Listener): () => void {
  publishingTagsListeners.add(listener);
  return () => {
    publishingTagsListeners.delete(listener);
  };
}
