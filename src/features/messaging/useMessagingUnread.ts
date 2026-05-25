import { useCallback, useMemo, useState, useEffect } from "react";
import { type Doc, type Role } from "../../convex/tripcastApi";
import { isUnreadForViewer } from "./messagingRules";

export function useMessagingUnread(messages: Doc<"messages">[], userId?: string, role?: Role, sessionId?: string) {
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    const stored = localStorage.getItem("tripcast.messagesLastReadAt");
    return stored ? parseInt(stored, 10) : 0;
  });

  const unreadCount = useMemo(() => {
    if (!messages.length) return 0;
    if (!role) return 0;
    return messages.filter((m) => isUnreadForViewer(m, lastReadAt, userId, role, sessionId)).length;
  }, [messages, lastReadAt, userId, role, sessionId]);

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
