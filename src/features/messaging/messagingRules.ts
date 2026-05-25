import { type Doc, type Role } from "../../convex/tripcastApi";

export function isOwnChatMessage(
  message: Doc<"messages">,
  userId: string | undefined,
  role: Role,
  sessionId?: string,
) {
  return (role === "traveler" && message.role === "traveler")
    || Boolean(userId && message.authorId === userId)
    || Boolean(sessionId && message.role !== "system" && message.triggeredBySessionId === sessionId);
}

export function isSelfTriggeredMessage(
  message: Doc<"messages">,
  userId: string | undefined,
  sessionId?: string,
) {
  return Boolean(userId && message.triggeredByUserId === userId)
    || Boolean(sessionId && message.triggeredBySessionId === sessionId);
}

export function isUnreadForViewer(
  message: Doc<"messages">,
  lastReadAt: number,
  userId: string | undefined,
  role: Role,
  sessionId?: string,
) {
  if (message._creationTime <= lastReadAt) return false;
  if (!userId && !sessionId && role !== "traveler") return false;
  if (isOwnChatMessage(message, userId, role, sessionId)) return false;
  if (isSelfTriggeredMessage(message, userId, sessionId)) return false;
  return true;
}

export function findNewestUnreadMessage(
  messages: Doc<"messages">[],
  lastReadAt: number,
  userId: string | undefined,
  role: Role,
  sessionId?: string,
) {
  return messages.reduce<Doc<"messages"> | null>((newest, message) => {
    if (!isUnreadForViewer(message, lastReadAt, userId, role, sessionId)) return newest;
    if (!newest || message._creationTime > newest._creationTime) return message;
    return newest;
  }, null);
}

export function findOldestUnreadMessage(
  messages: Doc<"messages">[],
  lastReadAt: number,
  userId: string | undefined,
  role: Role,
  sessionId?: string,
) {
  return messages.reduce<Doc<"messages"> | null>((oldest, message) => {
    if (!isUnreadForViewer(message, lastReadAt, userId, role, sessionId)) return oldest;
    if (!oldest || message._creationTime < oldest._creationTime) return message;
    return oldest;
  }, null);
}
