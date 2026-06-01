import { useEffect, useState, useCallback } from "react";
import { useQuery } from "convex/react";

import { tripcastApi, type Role } from "../../convex/tripcastApi";

const STORAGE_KEY = "tripcast.followerCutoffShowAll";
const EVENT_NAME = "tripcast.followerCutoffShowAllChanged";

function readStoredShowAll(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredShowAll(showAll: boolean) {
  try {
    if (showAll) sessionStorage.setItem(STORAGE_KEY, "true");
    else sessionStorage.removeItem(STORAGE_KEY);
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
export function useFollowerCutoffPreview(role: Role | undefined, token: string | undefined): FollowerCutoffPreview {
  const preferences = useQuery(
    tripcastApi.travelerPreferences.travelerGetPreferences,
    role === "traveler" && token ? { token } : "skip",
  );

  const [showAll, setShowAllState] = useState<boolean>(() =>
    role === "traveler" ? readStoredShowAll() : false,
  );

  useEffect(() => {
    if (role !== "traveler") return;
    const handler = () => setShowAllState(readStoredShowAll());
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [role]);

  const setShowAll = useCallback((next: boolean) => {
    setShowAllState(next);
    writeStoredShowAll(next);
  }, []);

  if (role !== "traveler") {
    return { available: false, showAll: false, cutoffAt: null, setShowAll };
  }

  const available =
    preferences?.followerContentCutoffEnabled === true && preferences.followerContentCutoffAt !== undefined;
  const cutoffAt = available && !showAll ? (preferences?.followerContentCutoffAt ?? null) : null;

  return { available, showAll, cutoffAt, setShowAll };
}
