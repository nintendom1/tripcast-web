import { useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { logMapEvent } from "../../debug/debugLogger";

const MAX_CONCURRENT_PREFETCHES = 3;

export function useImagePrefetch(token: string, imageIds: string[]) {
  const convex = useConvex();
  // Track image IDs we've already resolved (or warmed) so a re-render with the
  // same array doesn't fan out duplicate Convex queries. Keyed by token so a
  // sign-out / role switch invalidates. Errors clear the entry so a later
  // render can retry.
  const fetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token || imageIds.length === 0) return;
    let cancelled = false;

    const cacheKey = (id: string) => `${token}:${id}`;
    const queue = imageIds.filter((id) => id && !fetched.current.has(cacheKey(id)));
    let inFlight = 0;
    let cursor = 0;

    const pump = () => {
      while (!cancelled && inFlight < MAX_CONCURRENT_PREFETCHES && cursor < queue.length) {
        const imageId = queue[cursor++];
        fetched.current.add(cacheKey(imageId));
        inFlight++;
        runOne(imageId).finally(() => {
          inFlight--;
          if (!cancelled) pump();
        });
      }
    };

    const runOne = async (imageId: string) => {
      const start = performance.now();
      try {
        const url = await convex.query(tripcastApi.checkpoints.getStoryImageUrl, {
          token,
          imageId,
        });
        if (cancelled || !url) return;
        const urlMs = Math.round(performance.now() - start);
        await new Promise<void>((resolve) => {
          const img = new Image();
          // Prefetch only warms the HTTP/disk cache; load is enough to free the
          // concurrency slot. The visible <img> in LoadingImage decodes before
          // it paints, so decoding the throwaway Image here would only burn CPU
          // (the bitmap isn't reused) and serialize the pump on decode latency.
          img.onload = () => {
            // Effect may have torn down while this image was loading; skip the
            // success log but still settle so the pump's bookkeeping unwinds.
            if (!cancelled) {
              logMapEvent("image:prefetch:success", {
                imageId,
                urlFetchMs: urlMs,
                totalMs: Math.round(performance.now() - start),
              });
            }
            resolve();
          };
          img.onerror = () => {
            // Don't unmark — a broken URL won't get fixed by retrying.
            logMapEvent("image:prefetch:error", { imageId, reason: "image-load-failed" });
            resolve();
          };
          img.src = url;
        });
      } catch (e) {
        fetched.current.delete(cacheKey(imageId));
        logMapEvent("image:prefetch:error", {
          imageId,
          reason: "query-failed",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    };

    pump();
    return () => {
      cancelled = true;
    };
  }, [convex, token, imageIds]);
}
