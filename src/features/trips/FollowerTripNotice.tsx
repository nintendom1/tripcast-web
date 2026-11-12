import { useEffect, useRef, useState } from "react";

import { useTripContext } from "../../providers/TripContextProvider";

const NOTICE_MS = 4000;

/**
 * Follower only. When the trip the Follower follows changes (the Traveler shared another trip), `onSwitch` runs (the
 * shell closes its sheets and the credits replay; the map resets itself on the new trip) and a notice says "The
 * Traveler is now sharing <title>." While the followed trip is planned, a line on the map says "<title> hasn't
 * started yet." Nothing renders for a Traveler, before the followed trip is known, or while it does not change.
 */
export function FollowerTripNotice({ onSwitch }: { onSwitch?: () => void }) {
  const { role, followerTrip } = useTripContext();
  const follower = role === "follower";
  const tripId = follower ? followerTrip?.tripId : undefined;
  const title = followerTrip?.title;
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const lastTripId = useRef<string | null>(null);
  const onSwitchRef = useRef(onSwitch);
  useEffect(() => {
    onSwitchRef.current = onSwitch;
  });

  useEffect(() => {
    if (!tripId || title === undefined) return;
    const previous = lastTripId.current;
    lastTripId.current = tripId;
    // The first trip seen is where the Follower started, not a switch.
    if (previous === null || previous === tripId) return;
    onSwitchRef.current?.();
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, message: `The Traveler is now sharing ${title}.` }));
  }, [tripId, title]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!follower) return null;
  const planned = followerTrip?.lifecycle === "planned" ? followerTrip.title : null;

  return (
    <>
      {planned ? (
        <p
          role="status"
          className="pointer-events-none fixed left-1/2 top-[calc(6rem+env(safe-area-inset-top,0px))] z-[5] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-full bg-[var(--bg-card)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-1)] shadow-[var(--shadow-card)]"
        >
          {planned} hasn&apos;t started yet.
        </p>
      ) : null}
      {notice ? (
        <div
          key={notice.id}
          role="status"
          className="pointer-events-none fixed inset-x-4 bottom-24 z-[120] mx-auto w-fit max-w-sm rounded-full bg-[var(--ink-1)] px-4 py-2 text-center text-sm font-semibold text-[var(--ink-on-dark)] shadow-xl"
        >
          {notice.message}
        </div>
      ) : null}
    </>
  );
}
