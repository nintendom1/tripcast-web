import type { Role } from "../convex/tripcastApi";

const SESSION_KEY = "tripcast.session";

export type SessionType = "legacy" | "follower";

export type StoredSession = {
  token: string;
  role: Role;
  sessionType: SessionType;
  displayName?: string;
  username?: string;
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
      typeof (parsed as { token: unknown }).token === "string" &&
      ((parsed as { role: unknown }).role === "traveler" ||
        (parsed as { role: unknown }).role === "support_crew")
    ) {
      const stored = parsed as Partial<StoredSession>;
      return {
        token: stored.token!,
        role: stored.role!,
        sessionType: stored.sessionType ?? "legacy",
        displayName: stored.displayName,
        username: stored.username,
      };
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
