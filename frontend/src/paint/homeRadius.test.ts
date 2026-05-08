import { describe, expect, it } from "vitest";

import { h3CellToLngLat } from "@/geo/h3Helpers";

import {
  HOME_RADIUS_H3_RESOLUTION,
  HOME_RADIUS_METERS,
  createHomeRadiusCircleFeatureCollection,
  createHomeRadiusPaintH3Ids,
  distanceMeters,
} from "./homeRadius";

const MOSCOW_CENTER = {
  lng: 37.6173,
  lat: 55.7558,
};

describe("home radius helpers", () => {
  it("creates a closed radius circle polygon", () => {
    const featureCollection = createHomeRadiusCircleFeatureCollection(
      MOSCOW_CENTER,
      HOME_RADIUS_METERS,
      16,
    );
    const ring = featureCollection.features[0]?.geometry.coordinates[0];

    expect(featureCollection.features[0]?.properties.radiusMeters).toBe(
      HOME_RADIUS_METERS,
    );
    expect(ring).toHaveLength(17);
    expect(ring?.[0]).toEqual(ring?.[ring.length - 1]);
    expect(
      distanceMeters(MOSCOW_CENTER, { lng: ring![0][0], lat: ring![0][1] }),
    ).toBeCloseTo(HOME_RADIUS_METERS, -1);
  });

  it("creates H3 cells for the 10km home radius", () => {
    const h3Ids = createHomeRadiusPaintH3Ids(
      MOSCOW_CENTER,
      HOME_RADIUS_METERS,
      HOME_RADIUS_H3_RESOLUTION,
    );
    const uniqueH3Ids = new Set(h3Ids);
    const farthestCentroidMeters = Math.max(
      ...h3Ids.map((h3Id) => distanceMeters(MOSCOW_CENTER, h3CellToLngLat(h3Id))),
    );

    expect(h3Ids.length).toBeGreaterThan(15_000);
    expect(h3Ids.length).toBeLessThan(25_000);
    expect(uniqueH3Ids.size).toBe(h3Ids.length);
    expect(farthestCentroidMeters).toBeLessThan(10_200);
  });

  it("rejects invalid radius geometry inputs", () => {
    expect(() => createHomeRadiusCircleFeatureCollection(MOSCOW_CENTER, 0)).toThrow(
      "positive",
    );
    expect(() =>
      createHomeRadiusCircleFeatureCollection(MOSCOW_CENTER, HOME_RADIUS_METERS, 7),
    ).toThrow("at least 8");
  });
});
