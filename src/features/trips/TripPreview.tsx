import type { TripPreviewRoute } from "../../convex/tripcastApi";
import type { TripPreviewState } from "./useTripPreview";

const WIDTH = 240;
const HEIGHT = 120;
const PADDING = 8;
const MAX_POINTS = 128;

/** Fits the route into the box (uniform scale, longitude shortened by cos(latitude)) as SVG polyline points. */
export function routeToPolyline(route: TripPreviewRoute): string {
  const { bounds } = route;
  const points = route.points.slice(0, MAX_POINTS);
  const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const spanX = (bounds.maxLon - bounds.minLon) * Math.cos(midLat);
  const spanY = bounds.maxLat - bounds.minLat;
  const innerW = WIDTH - PADDING * 2;
  const innerH = HEIGHT - PADDING * 2;
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const k = Number.isFinite(scale) ? scale : 0;
  const offsetX = (WIDTH - spanX * k) / 2;
  const offsetY = (HEIGHT - spanY * k) / 2;
  return points
    .map((p) => {
      const x = offsetX + (p.lon - bounds.minLon) * Math.cos(midLat) * k;
      const y = HEIGHT - offsetY - (p.lat - bounds.minLat) * k;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Lightweight preview of a highlighted trip: an inline SVG route sketch, counts and a lazy cover thumbnail. No map
 * is created. Skeleton while loading; a neutral placeholder when there is no preview yet or it failed.
 */
export function TripPreview({ state }: { state: TripPreviewState }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading preview"
        className="h-[120px] w-full animate-pulse rounded-lg bg-[var(--meter-track)]"
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="grid h-[120px] w-full place-items-center rounded-lg bg-[var(--bg-card)] text-xs text-[var(--ink-3)]">
        Preview unavailable
      </div>
    );
  }

  const { preview } = state;
  const route = preview.route && preview.route.points.length > 0 ? preview.route : null;

  return (
    <div className="grid gap-2" data-testid="trip-preview">
      <div className="relative h-[120px] w-full overflow-hidden rounded-lg bg-[var(--bg-card)]">
        {route ? (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-full w-full"
            role="img"
            aria-label="Route sketch"
            preserveAspectRatio="xMidYMid meet"
          >
            <polyline
              points={routeToPolyline(route)}
              fill="none"
              stroke="var(--flag)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-[var(--ink-3)]">No route preview yet</div>
        )}
        {preview.coverImageUrl ? (
          <img
            src={preview.coverImageUrl}
            alt="Trip cover"
            loading="lazy"
            decoding="async"
            className="absolute bottom-1 right-1 h-12 w-12 rounded-md border border-[var(--line-soft)] object-cover"
          />
        ) : null}
      </div>
      <p className="text-xs text-[var(--ink-2)]">
        {preview.storyCount} {preview.storyCount === 1 ? "story" : "stories"} · {preview.missionCount}{" "}
        {preview.missionCount === 1 ? "mission" : "missions"} · {preview.routeVoteCount}{" "}
        {preview.routeVoteCount === 1 ? "route vote" : "route votes"}
      </p>
    </div>
  );
}
