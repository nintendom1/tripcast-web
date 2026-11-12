import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";

import { tripcastApi, type TripPreview } from "../../convex/tripcastApi";
import { tripClientFor } from "../../convex/useTrip";
import { useTripContext } from "../../providers/TripContextProvider";

/** The few card fields a preview needs: the memo key is `tripId:previewVersion`. */
export type PreviewCandidate = { tripId: string; previewVersion: number };

export type TripPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: TripPreview }
  | { status: "unavailable" };

/** Previews kept per pane open; the oldest goes first. */
export const PREVIEW_CACHE_SIZE = 24;

const keyOf = (c: PreviewCandidate) => `${c.tripId}:${c.previewVersion}`;

/**
 * Preview of the highlighted card, fetched with a ONE-SHOT imperative query (never a subscription) and memoised by
 * `tripId:previewVersion`. The cache lives in this hook, so it ends with the pane that mounted it. A response for a
 * card that is no longer highlighted is kept for its own key but never becomes the current state.
 */
export function useTripPreview(candidate: PreviewCandidate | null): TripPreviewState {
  const { token } = useTripContext();
  const client = useConvex();
  // Latest client without making it an effect dependency: a preview is fetched per key, not per render.
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  });
  const cache = useRef(new Map<string, TripPreview>());
  const key = candidate ? keyOf(candidate) : null;
  const tripId = candidate?.tripId ?? null;
  const [settled, setSettled] = useState<{ key: string; preview: TripPreview | null } | null>(null);

  useEffect(() => {
    if (!key || !tripId || cache.current.has(key)) return;
    let current = true;
    // The preview is about the card's trip, not the view: the client names that trip.
    tripClientFor(clientRef.current, tripId)
      .query(tripcastApi.trips.getTripPreview, { token })
      .then((preview) => {
        cache.current.set(key, preview);
        while (cache.current.size > PREVIEW_CACHE_SIZE) {
          const oldest = cache.current.keys().next().value;
          if (oldest === undefined) break;
          cache.current.delete(oldest);
        }
        if (current) setSettled({ key, preview });
      })
      .catch(() => {
        if (current) setSettled({ key, preview: null });
      });
    return () => {
      current = false;
    };
  }, [key, tripId, token]);

  if (!key) return { status: "idle" };
  const cached = cache.current.get(key);
  if (cached) return { status: "ready", preview: cached };
  if (settled?.key === key) {
    return settled.preview ? { status: "ready", preview: settled.preview } : { status: "unavailable" };
  }
  return { status: "loading" };
}
