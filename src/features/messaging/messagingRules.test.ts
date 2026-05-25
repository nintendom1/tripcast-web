import { describe, expect, it } from "vitest";
import { type Doc } from "../../convex/tripcastApi";
import {
  findNewestUnreadMessage,
  findOldestUnreadMessage,
  isOwnChatMessage,
  isUnreadForViewer,
} from "./messagingRules";

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

describe("messagingRules", () => {
  it("treats a follower message from the current session as the viewer's own message", () => {
    const message = makeMessage({
      authorId: "different-user",
      triggeredBySessionId: "viewer-session",
    });

    expect(isOwnChatMessage(message, "viewer-user", "follower", "viewer-session")).toBe(true);
  });

  it("does not count own or self-triggered messages as unread", () => {
    const ownChatMessage = makeMessage({
      _id: "own",
      _creationTime: 2000,
      authorId: "viewer-user",
    });
    const selfTriggeredActivity = makeMessage({
      _id: "activity",
      _creationTime: 3000,
      role: "system",
      triggeredBySessionId: "viewer-session",
    });

    expect(isUnreadForViewer(ownChatMessage, 1000, "viewer-user", "follower", "viewer-session")).toBe(false);
    expect(isUnreadForViewer(selfTriggeredActivity, 1000, "viewer-user", "follower", "viewer-session")).toBe(false);
  });

  it("finds the oldest and newest countable unread messages", () => {
    const messages = [
      makeMessage({ _id: "read", _creationTime: 900 }),
      makeMessage({ _id: "own", _creationTime: 1100, authorId: "viewer-user" }),
      makeMessage({ _id: "first-unread", _creationTime: 1200, authorId: "other-user" }),
      makeMessage({ _id: "self-triggered", _creationTime: 1300, role: "system", triggeredBySessionId: "viewer-session" }),
      makeMessage({ _id: "latest-unread", _creationTime: 1400, authorId: "another-user" }),
    ];

    expect(findOldestUnreadMessage(messages, 1000, "viewer-user", "follower", "viewer-session")?._id)
      .toBe("first-unread");
    expect(findNewestUnreadMessage(messages, 1000, "viewer-user", "follower", "viewer-session")?._id)
      .toBe("latest-unread");
  });
});
