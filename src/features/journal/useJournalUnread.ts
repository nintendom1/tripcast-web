import { useMemo, useState } from "react";
import type { JournalEvent } from "../../convex/tripcastApi";
import { useTripClientKey } from "../trips/privateTripView";

const LAST_READ_KEY = "tripcast.journalLastReadAt";

/** Per viewed trip: each trip's Story list keeps its own read marker. No trip key (disabled, Legacy Trip) keeps today's key. */
function journalReadKey(tripKey: string): string {
  return tripKey ? `${LAST_READ_KEY}:${tripKey}` : LAST_READ_KEY;
}

function readStoredAt(key: string): number {
  const raw = localStorage.getItem(key);
  return raw ? Number(raw) : 0;
}

export function useJournalUnread(events: JournalEvent[]) {
  const key = journalReadKey(useTripClientKey());
  const [stored, setStored] = useState<{ key: string; at: number }>(() => ({ key, at: readStoredAt(key) }));
  // A trip switch changes the key: read that trip's marker instead of the one stored for the previous trip.
  const lastReadAt = stored.key === key ? stored.at : readStoredAt(key);

  const unreadCount = useMemo(
    () => events.filter((e) => e.narrativeLevel === "narrative" && e.occurredAt > lastReadAt).length,
    [events, lastReadAt],
  );

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(key, String(now));
    setStored({ key, at: now });
  }

  return { unreadCount, markAllRead, lastReadAt };
}
