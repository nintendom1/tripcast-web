import { useCallback, useMemo, useState, useEffect } from "react";
import { type Doc, type Role } from "../../convex/tripcastApi";
import { isUnreadForViewer } from "./messagingRules";
import { useOptionalTripContext } from "../../providers/TripContextProvider";

function readStoredAt(key: string): number {
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

export function useMessagingUnread(messages: Doc<"messages">[], userId?: string, role?: Role, sessionId?: string) {
  // Per viewed trip: each trip's chat keeps its own read marker. No viewed trip keeps today's key.
  const { viewingTripId } = useOptionalTripContext();
  const key = viewingTripId ? `tripcast.messagesLastReadAt:${viewingTripId}` : "tripcast.messagesLastReadAt";
  const [stored, setStored] = useState<{ key: string; at: number }>(() => ({ key, at: readStoredAt(key) }));
  // A trip switch changes the key: read that trip's marker instead of the one stored for the previous trip.
  const lastReadAt = stored.key === key ? stored.at : readStoredAt(key);

  const unreadCount = useMemo(() => {
    if (!messages.length) return 0;
    if (!role) return 0;
    return messages.filter((m) => isUnreadForViewer(m, lastReadAt, userId, role, sessionId)).length;
  }, [messages, lastReadAt, userId, role, sessionId]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    localStorage.setItem(key, now.toString());
    setStored({ key, at: now });
  }, [key]);

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
