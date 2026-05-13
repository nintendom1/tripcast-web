import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import type { RouteVoteStatus } from "../convex/tripcastApi";

dayjs.extend(duration);

export function formatTimeRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Expired";
  const d = dayjs.duration(ms);
  const days = Math.floor(d.asDays());
  const hours = d.hours();
  const minutes = d.minutes();
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function computeEffectiveStatusClient(
  status: RouteVoteStatus,
  expiresAt: number,
): RouteVoteStatus {
  if (status === "active" && expiresAt <= Date.now()) return "closed";
  return status;
}

export function formatVotePct(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

export function isFiniteRouteCoordinate<T extends { lat?: number; lon?: number }>(
  coordinate: T | null | undefined,
): coordinate is T & { lat: number; lon: number } {
  return (
    coordinate !== null &&
    coordinate !== undefined &&
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lon)
  );
}

export function getRouteVoteMapBounds(
  options: Array<{ lat: number; lon: number }>,
  origin?: { lat: number; lon: number } | null,
): [[number, number], [number, number]] | null {
  const coordinates = [
    ...(isFiniteRouteCoordinate(origin) ? [origin] : []),
    ...options.filter(isFiniteRouteCoordinate),
  ];

  if (coordinates.length === 0) return null;

  const lons = coordinates.map((coordinate) => coordinate.lon);
  const lats = coordinates.map((coordinate) => coordinate.lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
