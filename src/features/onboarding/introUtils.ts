import type { Role } from "../../convex/tripcastApi";

const INTRO_STORAGE_PREFIX = "tripcast.introSeen.v1";

export function introSeenStorageKey(role: Role, accountLabel?: string): string {
  return `${INTRO_STORAGE_PREFIX}.${role}.${accountLabel?.trim().toLowerCase() || "unknown"}`;
}

export function hasLocalIntroSeen(role: Role, accountLabel?: string): boolean {
  try {
    return window.localStorage.getItem(introSeenStorageKey(role, accountLabel)) === "1";
  } catch {
    return false;
  }
}

export function markLocalIntroSeen(role: Role, accountLabel?: string): void {
  try {
    window.localStorage.setItem(introSeenStorageKey(role, accountLabel), "1");
  } catch {
    // localStorage can be unavailable; backend seen state remains canonical.
  }
}
