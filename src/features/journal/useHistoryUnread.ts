import { useMemo, useState } from "react";
import type { HistoryEvent } from "../../convex/tripcastApi";

const LAST_READ_KEY = "tripcast.historyLastReadAt";

export function useHistoryUnread(events: HistoryEvent[]) {
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    const raw = localStorage.getItem(LAST_READ_KEY);
    return raw ? Number(raw) : 0;
  });

  const unreadCount = useMemo(
    () => events.filter((e) => e.storyLevel === "story" && e.occurredAt > lastReadAt).length,
    [events, lastReadAt],
  );

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(LAST_READ_KEY, String(now));
    setLastReadAt(now);
  }

  return { unreadCount, markAllRead };
}
