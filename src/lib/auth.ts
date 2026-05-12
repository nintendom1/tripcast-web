import type { Role } from "../convex/tripcastApi";

const SESSION_KEY = "tripcast.session";

export type StoredSession = {
  token: string;
  role: Role;
};

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "token" in parsed &&
      "role" in parsed &&
      typeof (parsed as StoredSession).token === "string" &&
      ((parsed as StoredSession).role === "traveler" ||
        (parsed as StoredSession).role === "support_crew")
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
