import {
  UNITS,
  cellToBoundary,
  cellToLatLng,
  getHexagonEdgeLengthAvg,
  getResolution,
  gridDisk,
  isValidCell,
  latLngToCell,
} from "h3-js";

import {
  DEFAULT_H3_RESOLUTION,
  MAX_H3_RESOLUTION,
  MIN_H3_RESOLUTION,
} from "@/config/h3";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface H3ResolutionMetrics {
  edgeLengthMeters: number;
  apothemMeters: number;
  centerSpacingMeters: number;
}

export type GeoJsonPosition = [number, number];

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: GeoJsonPosition[][];
}

export interface H3CellFeature {
  type: "Feature";
  properties: {
    h3Id: string;
    resolution: number;
  };
  geometry: GeoJsonPolygon;
}

export interface H3CellFeatureCollection {
  type: "FeatureCollection";
  features: H3CellFeature[];
}

export function lngLatToH3Cell(
  lngLat: LngLat,
  resolution = DEFAULT_H3_RESOLUTION,
): string {
  assertValidLngLat(lngLat);
  assertValidH3Resolution(resolution);

  return latLngToCell(lngLat.lat, lngLat.lng, resolution);
}

export function h3CellToGeoJsonFeature(h3Id: string): H3CellFeature {
  assertValidH3Cell(h3Id);

  const boundary = cellToBoundary(h3Id, true) as GeoJsonPosition[];

  return {
    type: "Feature",
    properties: {
      h3Id,
      resolution: getResolution(h3Id),
    },
    geometry: {
      type: "Polygon",
      coordinates: [closeLinearRing(boundary)],
    },
  };
}

export function h3CellToLngLat(h3Id: string): LngLat {
  assertValidH3Cell(h3Id);

  const [lat, lng] = cellToLatLng(h3Id);

  return { lng, lat };
}

export function h3CellsToGeoJsonFeatureCollection(
  h3Ids: string[],
): H3CellFeatureCollection {
  return {
    type: "FeatureCollection",
    features: h3Ids.map((h3Id) => h3CellToGeoJsonFeature(h3Id)),
  };
}

export function metersToH3DiskRadius(
  radiusMeters: number,
  resolution = DEFAULT_H3_RESOLUTION,
): number {
  assertValidRadiusMeters(radiusMeters);
  const metrics = getH3ResolutionMetrics(resolution);

  if (radiusMeters <= metrics.apothemMeters) {
    return 0;
  }

  return Math.ceil(
    (radiusMeters - metrics.apothemMeters) / metrics.centerSpacingMeters,
  );
}

export function getH3DiskForLngLat(
  lngLat: LngLat,
  radiusMeters: number,
  resolution = DEFAULT_H3_RESOLUTION,
): string[] {
  const origin = lngLatToH3Cell(lngLat, resolution);
  const diskRadius = metersToH3DiskRadius(radiusMeters, resolution);

  return gridDisk(origin, diskRadius);
}

export function getH3ResolutionMetrics(
  resolution = DEFAULT_H3_RESOLUTION,
): H3ResolutionMetrics {
  assertValidH3Resolution(resolution);

  const edgeLengthMeters = getHexagonEdgeLengthAvg(resolution, UNITS.m);

  return {
    edgeLengthMeters,
    apothemMeters: (Math.sqrt(3) / 2) * edgeLengthMeters,
    centerSpacingMeters: Math.sqrt(3) * edgeLengthMeters,
  };
}

function closeLinearRing(ring: GeoJsonPosition[]): GeoJsonPosition[] {
  if (ring.length === 0) {
    return ring;
  }

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];

  if (firstLng === lastLng && firstLat === lastLat) {
    return ring;
  }

  return [...ring, [firstLng, firstLat]];
}

function assertValidH3Cell(h3Id: string): void {
  if (!isValidCell(h3Id)) {
    throw new Error(`Invalid H3 cell id: ${h3Id}`);
  }
}

function assertValidH3Resolution(resolution: number): void {
  if (
    !Number.isInteger(resolution) ||
    resolution < MIN_H3_RESOLUTION ||
    resolution > MAX_H3_RESOLUTION
  ) {
    throw new Error(
      `H3 resolution must be an integer between ${MIN_H3_RESOLUTION} and ${MAX_H3_RESOLUTION}`,
    );
  }
}

function assertValidLngLat({ lng, lat }: LngLat): void {
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Longitude must be a finite number between -180 and 180");
  }

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude must be a finite number between -90 and 90");
  }
}

function assertValidRadiusMeters(radiusMeters: number): void {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new Error("Brush radius must be a finite non-negative meter value");
  }
}
