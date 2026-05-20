import { useMemo, useState } from "react";
import type { JournalEvent } from "../../convex/tripcastApi";

const LAST_READ_KEY = "tripcast.journalLastReadAt";

export function useJournalUnread(events: JournalEvent[]) {
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    const raw = localStorage.getItem(LAST_READ_KEY);
    return raw ? Number(raw) : 0;
  });

  const unreadCount = useMemo(
    () => events.filter((e) => e.narrativeLevel === "narrative" && e.occurredAt > lastReadAt).length,
    [events, lastReadAt],
  );

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(LAST_READ_KEY, String(now));
    setLastReadAt(now);
  }

  return { unreadCount, markAllRead };
}
