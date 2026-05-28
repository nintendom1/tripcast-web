const EARTH_RADIUS_M = 6_371_000;

export function circlePolygon(
  lat: number,
  lon: number,
  radiusMeters: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latR = (lat * Math.PI) / 180;
  const angR = radiusMeters / EARTH_RADIUS_M;
  const coords: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const b = (2 * Math.PI * i) / steps;
    const dLat = Math.asin(
      Math.sin(latR) * Math.cos(angR) +
        Math.cos(latR) * Math.sin(angR) * Math.cos(b),
    );
    const dLon =
      (lon * Math.PI) / 180 +
      Math.atan2(
        Math.sin(b) * Math.sin(angR) * Math.cos(latR),
        Math.cos(angR) - Math.sin(latR) * Math.sin(dLat),
      );
    coords.push([(dLon * 180) / Math.PI, (dLat * 180) / Math.PI]);
  }

  coords.push(coords[0]!);

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
