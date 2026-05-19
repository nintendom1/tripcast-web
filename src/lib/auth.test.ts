import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "./auth";

const SESSION_KEY = "tripcast.session";

beforeEach(() => {
  localStorage.clear();
});

describe("stored auth session", () => {
  it("returns null when no session is stored", () => {
    expect(getStoredSession()).toBeNull();
  });

  it("round-trips a follower session", () => {
    const session: StoredSession = {
      token: "session-token",
      role: "support_crew",
      sessionType: "follower",
      displayName: "Alice",
      username: "alice",
    };

    setStoredSession(session);

    expect(getStoredSession()).toEqual(session);
  });

  it("defaults older stored sessions to legacy", () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: "legacy-token", role: "traveler" }),
    );

    expect(getStoredSession()).toEqual({
      token: "legacy-token",
      role: "traveler",
      sessionType: "legacy",
    });
  });

  it("rejects invalid stored session shapes", () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: "x", role: "admin" }));

    expect(getStoredSession()).toBeNull();
  });

  it("returns null for malformed stored JSON", () => {
    localStorage.setItem(SESSION_KEY, "{not-json");

    expect(getStoredSession()).toBeNull();
  });

  it("clears the stored session", () => {
    setStoredSession({ token: "session-token", role: "traveler", sessionType: "legacy" });

    clearStoredSession();

    expect(getStoredSession()).toBeNull();
  });
});
