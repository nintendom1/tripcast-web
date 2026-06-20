import { useEffect } from "react";
import { useConvex } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { recordImageSizes, getRecordedImageIds } from "../../lib/egressMeter";

/**
 * Records the served byte size of the story images this device fetches (the same
 * set `useImagePrefetch` warms), so the Developer usage estimate reflects real
 * image egress. Batch-queries sizes only for image IDs not already recorded this
 * month, then stores them locally. Best-effort; failures are ignored.
 */
export function useEgressMeter(token: string, imageIds: string[]) {
  const convex = useConvex();
  useEffect(() => {
    if (!token || imageIds.length === 0) return;
    const recorded = getRecordedImageIds();
    const missing = imageIds.filter((id) => id && !recorded.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    convex
      .query(tripcastApi.checkpoints.getStoryImageSizes, { token, imageIds: missing })
      .then((rows) => {
        if (!cancelled && rows && rows.length > 0) recordImageSizes(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [convex, token, imageIds]);
}
