// Web-side multi-trip types shared by every trip package (contract package WC).
// Types only: no runtime code lives in this file.

import type {
  CurrentTrip,
  EffectiveTrip,
  Role,
  TripCard,
  TripLifecycle,
  TripPreview,
  TripSwitchImpact,
} from "../../convex/tripcastApi";

/** Server API trip shapes, re-exported so trip packages import them from one place. */
export type { CurrentTrip, EffectiveTrip, TripCard, TripLifecycle, TripPreview, TripSwitchImpact };

/**
 * How the Traveler's map picks the trip it shows. In memory only; a cold start is always `follow_current`.
 * - `follow_current`: show the shared current trip (what Followers see) and follow it when it changes.
 * - `private`: show another trip privately; Followers, GPS, the epoch and the native queue are untouched.
 * Followers are always `follow_current`. Implemented by W1.
 */
export type ViewingMode = "follow_current" | "private";

/**
 * Whether the server's trip state is known: `loading` before the subscription (`getCurrentTrip` for a Traveler,
 * `getEffectiveTrip` for a Follower) first resolves, `known` once it has (multi-trip enabled or disabled), and
 * `unavailable` while it is failing (the context then shows the inert defaults).
 */
export type ServerTripStatus = "loading" | "known" | "unavailable";

/**
 * A trip an editor captured when it opened, so it keeps its target after a switch (shown by `TripTargetLabel`,
 * named in save toasts and destructive confirmations).
 */
export type TripTarget = {
  tripId: string;
  title: string;
};

/**
 * Value of `useTripContext()` (spec 05-web.md). WC ships an inert stub (multi-trip disabled, no trip ids, no-op
 * actions); W1 fills it in without changing this type.
 */
export type TripContextValue = {
  /** Session token of the signed-in user; every trip call passes it explicitly. */
  token: string;
  /** Role of the signed-in user. */
  role: Role;
  /**
   * The shared current trip from the `trips.getCurrentTrip` subscription (Traveler only), including the publishing
   * epoch and revision. It drives publishing, never the viewed trip. `undefined` while loading; `null` for
   * Followers, an older backend, or the stub.
   */
  currentTrip: CurrentTrip | null | undefined;
  /**
   * The trip Followers currently see. Followers read it from `followers.getEffectiveTrip` and key their caches by
   * its `tripId`; for the Traveler it mirrors `currentTrip` (banner: "Followers are viewing …"). `undefined`
   * while loading; `null` when unknown or in the stub.
   */
  followerTrip: EffectiveTrip | null | undefined;
  /** Whether the map follows the shared current trip or shows another trip privately. */
  viewingMode: ViewingMode;
  /**
   * The trip whose content the map and trip-scoped calls use (`useTripQuery` injects it). In `follow_current`
   * it is the latest server current trip; in `private` the trip opened privately. `null` means no trip id is
   * known yet: calls go untagged (the backend's Legacy Trip rule), as in the stub.
   */
  viewingTripId: string | null;
  /**
   * The viewed trip with its title (same trip as `viewingTripId`): the chip, banner and editors build their captured
   * `TripTarget` from it. In `follow_current` it is the current trip (Follower: `followerTrip`); in `private` the
   * trip passed to `openPrivately`. `null` when `viewingTripId` is `null` (stub, loading).
   */
  viewingTrip: TripTarget | null;
  /**
   * Show `target` privately (`viewingMode` = `private`, `viewingTrip` = `target`). No GPS, epoch or server calls.
   * Traveler only.
   */
  openPrivately: (target: TripTarget) => void;
  /** Go back to following the latest server current trip (`viewingMode` = `follow_current`). No GPS calls. */
  returnToCurrent: () => void;
  /**
   * Server flag (`CurrentTrip.multiTripEnabled`), Traveler only. The Traveler's chip, pane, banner and
   * `TripTargetLabel` render only when true. `false` in the stub and while loading. For a Follower it is always
   * `false`: do not gate Follower UI on it; a Follower detects a switch by `followerTrip.tripId` changing.
   */
  multiTripEnabled: boolean;
  /**
   * Feature boundaries call this when a trip-scoped query for `tripId` fails with `trip_not_found` (the trip was
   * deleted, archived-and-deleted or is no longer owned). If a private view is on that trip the device returns to
   * `follow_current`; otherwise it does nothing. Always provided by `TripContextProvider`; optional so seeded test
   * values may omit it.
   */
  reportTripUnavailable?: (tripId: string) => void;
  /**
   * Tells "still loading" or "failing" apart from "multi-trip disabled", which look the same in the other fields
   * (`currentTrip` null, `multiTripEnabled` false). Always provided by `TripContextProvider`; optional so seeded test
   * values may omit it (`TripContextTestProvider` defaults to `known`). Read an absent value as `known`.
   */
  serverTripStatus?: ServerTripStatus;
};
