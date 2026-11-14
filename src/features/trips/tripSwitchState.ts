import { useEffect, useState, useSyncExternalStore } from "react";

import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";

// "A shared-trip switch is awaiting the server": the pane reads "Switching…" and the logo's dot pulses while it is
// set. A tiny module store (not React state) so the logo, the pane, the dialog and a late response all see one
// record. The record carries the token of the request that made it, so an answer can only clear (or act on) its OWN
// request.

/** How long a switch may wait for the server before it is called slow ("Waiting for server…", Retry). */
export const SWITCH_SLOW_MS = 8000;

export type SwitchRequest = { token: number; tripId: string | null; startedAt: number };

let request: SwitchRequest | null = null;
let nextToken = 1;
const listeners = new Set<() => void>();

function emit(next: SwitchRequest | null) {
  request = next;
  listeners.forEach((listener) => listener());
}

/** Marks a switch to `tripId` as awaiting the server and returns its token. */
export function beginSwitch(tripId: string | null): number {
  const token = nextToken++;
  emit({ token, tripId, startedAt: Date.now() });
  return token;
}

/** Clears the pending record only if `token` is the request that made it (a stale answer changes nothing). */
export function endSwitch(token: number): void {
  if (request?.token === token) emit(null);
}

export function getSwitchRequest(): SwitchRequest | null {
  return request;
}

export function getSwitchPending(): boolean {
  return request !== null;
}

// The trip THIS device asked to make the shared current trip. Whoever announces the change (see
// `useTripPaneActions`) uses it to tell "a switch made here" from "a switch made on another device". It stays until
// the change is observed or the request fails: the answer and the new epoch can arrive in either order.
let ownSwitchTripId: string | null = null;

export function markOwnSwitch(tripId: string): void {
  ownSwitchTripId = tripId;
}

export function clearOwnSwitch(tripId: string): void {
  if (ownSwitchTripId === tripId) ownSwitchTripId = null;
}

/** True once when `tripId` is the trip this device asked for; clears the mark. */
export function consumeOwnSwitch(tripId: string): boolean {
  if (ownSwitchTripId !== tripId) return false;
  ownSwitchTripId = null;
  return true;
}

/**
 * Forgets the pending switch and the own-switch mark. Called when a session is left (every sign-out path), so the
 * next account on this device never reads "Switching…" or takes the previous account's switch for its own.
 */
export function resetSwitchState(): void {
  ownSwitchTripId = null;
  if (request) emit(null);
}

/** Anonymous set/clear for callers that have no request of their own (tests, resets). */
export function setSwitchPending(next: boolean): void {
  if (next) {
    if (!request) beginSwitch(null);
  } else if (request) {
    emit(null);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSwitchRequest(): SwitchRequest | null {
  return useSyncExternalStore(subscribe, getSwitchRequest, () => null);
}

export function useSwitchPending(): boolean {
  return useSwitchRequest() !== null;
}

/**
 * A switch is pending and either the device is offline or no answer came within `SWITCH_SLOW_MS`: the UI says it
 * is still waiting and stays fully usable.
 */
export function useSwitchStalled(): boolean {
  const current = useSwitchRequest();
  const online = useOnlineStatus();
  const [lateToken, setLateToken] = useState<number | null>(null);
  const token = current?.token ?? null;
  const startedAt = current?.startedAt ?? 0;
  useEffect(() => {
    if (token === null) return;
    const timer = setTimeout(() => setLateToken(token), Math.max(0, startedAt + SWITCH_SLOW_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [token, startedAt]);
  return token !== null && (lateToken === token || !online);
}

export const STILL_WAITING_MESSAGE = "Still waiting: this switch may apply when you are back online";

export type TripErrorInfo = { code: string | null; message: string };

const KNOWN_CODES = [
  "trip_revision_conflict",
  "trip_not_found",
  "trip_mismatch",
  "trip_lifecycle_blocked",
  "trip_delete_blocked",
  "multi_trip_disabled",
];

/**
 * The server's `{code, message}` from a thrown `ConvexError` (or a plain message). Codes only exist for tagged
 * trip calls; anything else comes back with `code: null` and its message.
 */
export function tripErrorInfo(error: unknown, fallback = "Something went wrong. Try again."): TripErrorInfo {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  if (typeof data === "object" && data !== null) {
    const { code, message } = data as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : null,
      message: typeof message === "string" && message ? message : fallback,
    };
  }
  const raw = typeof data === "string" ? data : error instanceof Error ? error.message : "";
  const code = KNOWN_CODES.find((known) => raw.includes(known)) ?? null;
  return { code, message: raw && !code ? raw : fallback };
}
