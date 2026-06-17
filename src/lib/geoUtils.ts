export type LatLon = { lat: number; lon: number };

/**
 * Calculates the Haversine distance between two coordinates in meters.
 */
export function distanceMeters(a: LatLon, b: LatLon) {
  const radiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const hav =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radiusMeters * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

/**
 * Calculates the initial bearing from point a to point b in degrees (0-360).
 */
export function calculateBearing(a: LatLon, b: LatLon) {
  const toRadians = (v: number) => (v * Math.PI) / 180;
  const toDegrees = (v: number) => (v * 180) / Math.PI;
  const lat1 = toRadians(a.lat);
  const lon1 = toRadians(a.lon);
  const lat2 = toRadians(b.lat);
  const lon2 = toRadians(b.lon);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Calculates the shortest difference between two angles in degrees (0-180).
 */
export function getAngleDifference(a: number, b: number) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
