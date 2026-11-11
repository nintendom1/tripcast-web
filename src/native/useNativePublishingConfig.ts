import type { Role } from "../convex/tripcastApi";

/** Inputs of the native publishing configuration; final (also the props of `LivePublishingBridge`). */
export type NativePublishingConfigOptions = {
  /** Session token sent to the native publisher. */
  token: string;
  /** Only a Traveler configures native publishing. */
  role: Role;
  /**
   * While set (epoch ms), GPS is suppressed and a successful configure does not retry native tracking. Read via a
   * ref, never as an effect dependency, so a change cannot reconfigure (each `configure()` cancels an upload).
   */
  gpsSuppressedUntil: number | null;
};

/**
 * Keeps the native publisher configured (`configureNativeLocationPublishing`).
 *
 * Final behaviour (W2): the effect now at `TripMap.tsx` "configureNativeLocationPublishing" moves here, adding
 * `captureTripId`, `publishingEpoch` and `tripTitle` from the context's `currentTrip` (the server's current trip,
 * never the viewed trip). It re-runs only when token, role or the current trip/epoch/title (or the publishing
 * settings it reads) change, because every `configure()` cancels the in-flight upload. It also re-runs on the retry
 * nonce from `nativePublishingSignal.ts` (TripMap's Retry buttons) and reports readiness there
 * (`setNativePublishingReady`), replacing TripMap's `nativeRetryNonce` state and `nativePublishingReadyRef`.
 *
 * WC stub: does nothing.
 */
export function useNativePublishingConfig(options: NativePublishingConfigOptions): void {
  void options;
}
