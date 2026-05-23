import { useCallback, useMemo, useState, useEffect } from "react";
import { type Doc, type Role } from "../../convex/tripcastApi";

export function useMessagingUnread(messages: Doc<"messages">[], userId?: string, role?: Role) {
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    const stored = localStorage.getItem("tripcast.messagesLastReadAt");
    return stored ? parseInt(stored, 10) : 0;
  });

  const unreadCount = useMemo(() => {
    if (!messages.length) return 0;
    return messages.filter((m) => {
      const isNew = m._creationTime > lastReadAt;
      const isOwnChat = (role === "traveler" && m.role === "traveler") || 
                        (m.authorId && m.authorId === userId);
      const isSelfTriggered = m.triggeredByUserId === userId;
      const isTargetedAtMe = m.targetUserId === userId;

      // Notify if new AND (not my chat message) AND (didn't trigger it OR it's specifically for me)
      return isNew && !isOwnChat && (!isSelfTriggered || isTargetedAtMe);
    }).length;
  }, [messages, lastReadAt, userId, role]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    localStorage.setItem("tripcast.messagesLastReadAt", now.toString());
    setLastReadAt(now);
  }, []);

  // Best-effort haptics on receipt
  useEffect(() => {
    if (unreadCount > 0) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Ignore haptic failures
      }
    }
  }, [unreadCount]);

  return { unreadCount, markAllRead, lastReadAt };
}