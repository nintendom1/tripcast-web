import { useEffect, useState, useCallback } from "react";
import { useTripQuery } from "../../convex/useTrip";
import { tripcastApi, type Role } from "../../convex/tripcastApi";
import { useOptionalTripContext } from "../../providers/TripContextProvider";
import { useTripClientKey } from "../trips/privateTripView";

const STORAGE_KEY = "tripcast.followerCutoffShowAll";
const EVENT_NAME = "tripcast.followerCutoffShowAllChanged";

/** Today's key, or one per trip (the viewed trip's cutoff is a different cutoff) when a non-Legacy trip is viewed. */
function storageKeyFor(clientKey: string): string {
  return clientKey ? `${STORAGE_KEY}.${clientKey}` : STORAGE_KEY;
}

function readStoredShowAll(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeStoredShowAll(key: string, showAll: boolean) {
  try {
    if (showAll) sessionStorage.setItem(key, "true");
    else sessionStorage.removeItem(key);
  } catch {
    // sessionStorage may be unavailable in some embeddings; the override just won't persist.
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export type FollowerCutoffPreview = {
  // True when the Sheet's primary cutoff toggle is on AND a date is saved
  // (i.e., there is an actual filter the Traveler could override). Always
  // false for Followers.
  available: boolean;
  // True when the Traveler has opted to bypass the cutoff for this tab.
  // Default is false (filter applied — Traveler sees the same as Followers).
  showAll: boolean;
  // The effective cutoff to apply UI-side. Null when no cutoff is saved,
  // when the Traveler has chosen "Show all," or when the caller is a Follower
  // (server already filters in that case).
  cutoffAt: number | null;
  setShowAll: (next: boolean) => void;
};

/**
 * Traveler-side cutoff filter hook. By default the Traveler's own UI is
 * filtered to match what a Follower sees — pre-cutoff stories, missions,
 * pins, route votes, etc. are hidden. A per-tab "Show all" override (managed
 * in `FollowerCutoffSection`) lifts the filter when the Traveler needs to
 * reach the hidden archive for admin/export/debug.
 *
 * State is persisted in sessionStorage so the override is scoped to the
 * current tab and clears when the browser is closed.
 *
 * For Followers, returns a null cutoff: the server has already filtered the
 * data they receive.
 */
export function useFollowerCutoffPreview(
  role: Role | undefined,
  token: string | undefined,
  pinnedTripId?: string,
): FollowerCutoffPreview {
  const preferences = useTripQuery(
    tripcastApi.travelerPreferences.travelerGetPreferences,
    role === "traveler" && token ? (pinnedTripId ? { token, tripId: pinnedTripId } : { token }) : "skip",
  );

  // `pinnedTripId` (optional): a section pinned to one trip reads and keys the override for that trip, not the view.
  const viewKey = useTripClientKey();
  const { currentTrip, viewingTrip } = useOptionalTripContext();
  // A pinned Legacy Trip keeps today's key (rule 11), whether it is shared or viewed privately: the viewed trip knows
  // `isLegacy` in a private view too (the context learned the Legacy Trip's id).
  const pinnedIsLegacy = [viewingTrip, currentTrip].some((trip) => trip?.isLegacy === true && trip.tripId === pinnedTripId);
  const clientKey = pinnedTripId === undefined ? viewKey : pinnedIsLegacy ? "" : pinnedTripId;
  const storageKey = storageKeyFor(clientKey);
  // The override lives in sessionStorage under the viewed trip's key. `override` remembers what this hook last saw or
  // set for one key; for any other key (the view changed) it is ignored and storage is read, so switching the view
  // never carries one trip's "Show all" over to another.
  const [override, setOverride] = useState<{ key: string; value: boolean } | null>(null);
  const showAll =
    role !== "traveler" ? false : override?.key === storageKey ? override.value : readStoredShowAll(storageKey);

  useEffect(() => {
    if (role !== "traveler") return;
    const handler = () => setOverride({ key: storageKey, value: readStoredShowAll(storageKey) });
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [role, storageKey]);

  const setShowAll = useCallback(
    (next: boolean) => {
      setOverride({ key: storageKey, value: next });
      writeStoredShowAll(storageKey, next);
    },
    [storageKey],
  );

  if (role !== "traveler") {
    return { available: false, showAll: false, cutoffAt: null, setShowAll };
  }

  const available =
    preferences?.followerContentCutoffEnabled === true && preferences.followerContentCutoffAt !== undefined;
  const cutoffAt = available && !showAll ? (preferences?.followerContentCutoffAt ?? null) : null;

  return { available, showAll, cutoffAt, setShowAll };
}
