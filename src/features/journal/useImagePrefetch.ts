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
          img.decoding = "async";
          img.onload = () => {
            if ("decode" in img) {
              img.decode().catch(() => {}).finally(() => {
                logMapEvent("image:prefetch:success", {
                  imageId,
                  urlFetchMs: urlMs,
                  totalMs: Math.round(performance.now() - start),
                  decoded: true,
                });
                resolve();
              });
            } else {
              logMapEvent("image:prefetch:success", {
                imageId,
                urlFetchMs: urlMs,
                totalMs: Math.round(performance.now() - start),
                decoded: false,
              });
              resolve();
            }
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
