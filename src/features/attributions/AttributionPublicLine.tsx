import { useTripQuery } from "../../convex/useTrip";

import { tripcastApi } from "../../convex/tripcastApi";
import type { AttributionSourceType } from "../../convex/tripcastApi";

type AttributionPublicLineProps = {
  token: string;
  sourceType: AttributionSourceType;
  sourceId: string;
  className?: string;
};

export default function AttributionPublicLine({
  token,
  sourceType,
  sourceId,
  className,
}: AttributionPublicLineProps) {
  const data = useTripQuery(tripcastApi.attributions.listAttributionsForSource, {
    token,
    sourceType,
    sourceId,
  });
  if (!data?.publicCopy) return null;
  return <p className={className}>{data.publicCopy}</p>;
}
