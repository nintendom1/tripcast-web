import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Doc } from "../../convex/tripcastApi";
import { useMessagingUnread } from "./useMessagingUnread";

const LAST_READ_KEY = "tripcast.messagesLastReadAt";

function makeMessage(overrides: Partial<Doc<"messages">>): Doc<"messages"> {
  return {
    _id: "message-1",
    _creationTime: 1000,
    text: "Hello",
    authorName: "Test User",
    role: "follower",
    ...overrides,
  };
}

describe("useMessagingUnread", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("counts only new messages that should notify the current viewer", () => {
    localStorage.setItem(LAST_READ_KEY, "1000");
    const messages = [
      makeMessage({ _id: "read", _creationTime: 900, authorId: "other-user" }),
      makeMessage({ _id: "own", _creationTime: 1100, authorId: "viewer-user" }),
      makeMessage({ _id: "self-triggered", _creationTime: 1200, role: "system", triggeredBySessionId: "viewer-session" }),
      makeMessage({ _id: "unread", _creationTime: 1300, authorId: "other-user" }),
    ];

    const { result } = renderHook(() => (
      useMessagingUnread(messages, "viewer-user", "follower", "viewer-session")
    ));

    expect(result.current.unreadCount).toBe(1);
  });

  it("does not count follower messages from the viewer's current session", () => {
    const messages = [
      makeMessage({
        _id: "current-session-message",
        _creationTime: 2000,
        authorId: "legacy-or-other-user",
        triggeredBySessionId: "viewer-session",
      }),
    ];

    const { result } = renderHook(() => (
      useMessagingUnread(messages, "viewer-user", "follower", "viewer-session")
    ));

    expect(result.current.unreadCount).toBe(0);
  });

  it("markAllRead updates localStorage and clears the unread count", () => {
    const messages = [
      makeMessage({ _id: "unread", _creationTime: 2000, authorId: "other-user" }),
    ];
    const { result } = renderHook(() => (
      useMessagingUnread(messages, "viewer-user", "follower", "viewer-session")
    ));

    expect(result.current.unreadCount).toBe(1);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(Number(localStorage.getItem(LAST_READ_KEY))).toBeGreaterThan(0);
  });
});
