import {
  getH3DiskForLngLat,
  getH3ResolutionMetrics,
  h3CellToLngLat,
  type GeoJsonPosition,
  type LngLat,
} from "@/geo/h3Helpers";

export const HOME_RADIUS_METERS = 10_000;
export const HOME_RADIUS_CIRCLE_STEPS = 96;
export const HOME_RADIUS_H3_RESOLUTION = 10;

const EARTH_RADIUS_METERS = 6_371_008.8;

export interface RadiusCircleFeature {
  type: "Feature";
  properties: {
    radiusMeters: number;
  };
  geometry: {
    type: "Polygon";
    coordinates: GeoJsonPosition[][];
  };
}

export interface RadiusCircleFeatureCollection {
  type: "FeatureCollection";
  features: RadiusCircleFeature[];
}

export function createHomeRadiusCircleFeatureCollection(
  center: LngLat,
  radiusMeters = HOME_RADIUS_METERS,
  steps = HOME_RADIUS_CIRCLE_STEPS,
): RadiusCircleFeatureCollection {
  assertValidRadius(radiusMeters);

  if (!Number.isInteger(steps) || steps < 8) {
    throw new Error("Radius circle must contain at least 8 steps");
  }

  const ring = Array.from({ length: steps }, (_, index) =>
    destinationPoint(center, radiusMeters, (index / steps) * 360),
  );

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          radiusMeters,
        },
        geometry: {
          type: "Polygon",
          coordinates: [closeLinearRing(ring)],
        },
      },
    ],
  };
}

export function createHomeRadiusPaintH3Ids(
  center: LngLat,
  radiusMeters = HOME_RADIUS_METERS,
  resolution = HOME_RADIUS_H3_RESOLUTION,
): string[] {
  assertValidRadius(radiusMeters);

  const edgeAllowanceMeters = getH3ResolutionMetrics(resolution).apothemMeters;
  const candidateH3Ids = getH3DiskForLngLat(
    center,
    radiusMeters + edgeAllowanceMeters,
    resolution,
  );

  return candidateH3Ids.filter((h3Id) => {
    const centroid = h3CellToLngLat(h3Id);

    return distanceMeters(center, centroid) <= radiusMeters + edgeAllowanceMeters;
  });
}

export function distanceMeters(left: LngLat, right: LngLat): number {
  const leftLat = degreesToRadians(left.lat);
  const rightLat = degreesToRadians(right.lat);
  const deltaLat = degreesToRadians(right.lat - left.lat);
  const deltaLng = degreesToRadians(right.lng - left.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return (
    2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function destinationPoint(
  center: LngLat,
  distanceMetersValue: number,
  bearingDegrees: number,
): GeoJsonPosition {
  const angularDistance = distanceMetersValue / EARTH_RADIUS_METERS;
  const bearing = degreesToRadians(bearingDegrees);
  const lat1 = degreesToRadians(center.lat);
  const lng1 = degreesToRadians(center.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [wrapLongitude(radiansToDegrees(lng2)), radiansToDegrees(lat2)];
}

function closeLinearRing(ring: GeoJsonPosition[]): GeoJsonPosition[] {
  if (ring.length === 0) {
    return ring;
  }

  return [...ring, ring[0]];
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function assertValidRadius(radiusMeters: number): void {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error("Home radius must be a positive meter value");
  }
}
