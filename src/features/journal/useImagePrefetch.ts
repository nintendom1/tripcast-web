import { useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { logMapEvent } from "../../debug/debugLogger";

export function useImagePrefetch(token: string, imageIds: string[]) {
  const convex = useConvex();
  const fetchedUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prefetch = async (imageId: string) => {
      if (fetchedUrls.current.has(imageId)) return;
      fetchedUrls.current.add(imageId);

      const start = performance.now();
      try {
        const url = await convex.query(tripcastApi.checkpoints.getStoryImageUrl, {
          token,
          imageId,
        });

        if (url) {
          const urlMs = Math.round(performance.now() - start);
          const img = new Image();
          img.onload = () => {
            const totalMs = Math.round(performance.now() - start);
            logMapEvent("image:prefetch:success", {
              imageId,
              urlFetchMs: urlMs,
              totalMs,
            });
          };
          img.onerror = () => {
            logMapEvent("image:prefetch:error", {
              imageId,
              reason: "image-load-failed",
            });
          };
          img.src = url;
        }
      } catch (e) {
        logMapEvent("image:prefetch:error", {
          imageId,
          reason: "query-failed",
          message: e instanceof Error ? e.message : String(e),
        });
        fetchedUrls.current.delete(imageId);
      }
    };

    // Prefetch all images in the list
    imageIds.forEach((id) => {
      if (id) prefetch(id);
    });
  }, [convex, token, imageIds]);
}
