import { useCallback, useMemo, useState, useEffect } from "react";
import { type Doc } from "../../convex/tripcastApi";

export function useMessagingUnread(messages: Doc<"messages">[]) {
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    const stored = localStorage.getItem("tripcast.messagesLastReadAt");
    return stored ? parseInt(stored, 10) : 0;
  });

  const unreadCount = useMemo(() => {
    if (!messages.length) return 0;
    return messages.filter((m) => {
      // System messages targeting someone else are already filtered by the query
      const isNew = m._creationTime > lastReadAt;
      const isNotDeleted = !m.deletedAt;
      return isNew && isNotDeleted;
    }).length;
  }, [messages, lastReadAt]);

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

  return { unreadCount, markAllRead };
}