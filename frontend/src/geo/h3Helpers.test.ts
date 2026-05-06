import { describe, expect, it } from "vitest";

import { DEFAULT_H3_RESOLUTION } from "@/config/h3";

import {
  getH3DiskForLngLat,
  getH3ResolutionMetrics,
  h3CellToGeoJsonFeature,
  h3CellsToGeoJsonFeatureCollection,
  lngLatToH3Cell,
  metersToH3DiskRadius,
} from "./h3Helpers";

const MOSCOW_CENTER = {
  lng: 37.6173,
  lat: 55.7558,
};

describe("H3 helpers", () => {
  it("converts lng/lat to an H3 cell at the default resolution", () => {
    const h3Id = lngLatToH3Cell(MOSCOW_CENTER);

    expect(h3Id).toBe("8b11aa7abdadfff");
  });

  it("converts lng/lat to an H3 cell at an explicit resolution", () => {
    const h3Id = lngLatToH3Cell(MOSCOW_CENTER, 10);

    expect(h3Id).toBe("8a11aa7abd1ffff");
  });

  it("converts an H3 cell to a closed GeoJSON polygon feature", () => {
    const h3Id = lngLatToH3Cell(MOSCOW_CENTER);
    const feature = h3CellToGeoJsonFeature(h3Id);
    const ring = feature.geometry.coordinates[0];

    expect(feature).toMatchObject({
      type: "Feature",
      properties: {
        h3Id,
        resolution: DEFAULT_H3_RESOLUTION,
      },
      geometry: {
        type: "Polygon",
      },
    });
    expect(ring.length).toBeGreaterThanOrEqual(7);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.every(([lng, lat]) => isLngLatPosition(lng, lat))).toBe(true);
  });

  it("converts multiple H3 cells to a GeoJSON feature collection", () => {
    const origin = lngLatToH3Cell(MOSCOW_CENTER);
    const h3Ids = getH3DiskForLngLat(MOSCOW_CENTER, 50);
    const featureCollection = h3CellsToGeoJsonFeatureCollection(h3Ids);

    expect(featureCollection.type).toBe("FeatureCollection");
    expect(featureCollection.features).toHaveLength(7);
    expect(
      featureCollection.features.map((feature) => feature.properties.h3Id),
    ).toContain(origin);
  });

  it("translates a meter brush radius to a reasonable H3 grid disk radius", () => {
    const metrics = getH3ResolutionMetrics(DEFAULT_H3_RESOLUTION);

    expect(metersToH3DiskRadius(0)).toBe(0);
    expect(metersToH3DiskRadius(metrics.apothemMeters - 0.1)).toBe(0);
    expect(metersToH3DiskRadius(metrics.apothemMeters + 0.1)).toBe(1);
    expect(metersToH3DiskRadius(100)).toBe(2);
  });

  it("returns the H3 disk for a brush around lng/lat", () => {
    const origin = lngLatToH3Cell(MOSCOW_CENTER);
    const disk = getH3DiskForLngLat(MOSCOW_CENTER, 50);

    expect(disk).toHaveLength(7);
    expect(disk).toContain(origin);
  });

  it("rejects invalid coordinates, resolution and radius", () => {
    expect(() => lngLatToH3Cell({ lng: 181, lat: 55 })).toThrow("Longitude");
    expect(() => lngLatToH3Cell({ lng: 37, lat: -91 })).toThrow("Latitude");
    expect(() => lngLatToH3Cell(MOSCOW_CENTER, 16)).toThrow("resolution");
    expect(() => metersToH3DiskRadius(-1)).toThrow("Brush radius");
    expect(() => h3CellToGeoJsonFeature("not-a-cell")).toThrow("Invalid H3 cell");
  });
});

function isLngLatPosition(lng: number, lat: number): boolean {
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}
