import { describe, expect, it } from "vitest";

import type { HomeLocation } from "@/api/homeLocation";
import type { MapViewState } from "@/state/mapViewState";

import {
  createHomeLocationInputFromLngLat,
  createHomeLocationInputFromMapViewState,
  createMapViewStateForHomeLocation,
  normalizeHomeLocation,
} from "./homeLocation";

describe("home location state helpers", () => {
  it("normalizes persisted home locations", () => {
    const homeLocation: HomeLocation = {
      longitude: 37.6173,
      latitude: 55.7558,
      zoom: 14,
      updated_at: "2026-05-08T10:00:00.000Z",
    };

    expect(normalizeHomeLocation(homeLocation)).toEqual({
      longitude: 37.6173,
      latitude: 55.7558,
      zoom: 14,
      updatedAt: "2026-05-08T10:00:00.000Z",
    });
    expect(normalizeHomeLocation(null)).toBeNull();
  });

  it("rejects invalid persisted coordinates", () => {
    expect(
      normalizeHomeLocation({
        longitude: 181,
        latitude: 55.7558,
        zoom: 14,
        updated_at: "2026-05-08T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("creates backend input from the current map view", () => {
    const mapViewState = mapView([37.6173, 55.7558], 13.5);

    expect(createHomeLocationInputFromMapViewState(mapViewState)).toEqual({
      longitude: 37.6173,
      latitude: 55.7558,
      zoom: 13.5,
    });
  });

  it("creates backend input from a clicked map point", () => {
    expect(
      createHomeLocationInputFromLngLat({ lng: -73.9857, lat: 40.7484 }, 15),
    ).toEqual({
      longitude: -73.9857,
      latitude: 40.7484,
      zoom: 15,
    });
  });

  it("creates the next map view for home navigation", () => {
    const currentMapViewState = mapView([0, 0], 5);

    expect(
      createMapViewStateForHomeLocation(currentMapViewState, {
        longitude: 37.6173,
        latitude: 55.7558,
        zoom: 14,
      }),
    ).toEqual({
      ...currentMapViewState,
      center: [37.6173, 55.7558],
      zoom: 14,
    });
  });
});

function mapView(center: [number, number], zoom: number): MapViewState {
  return {
    center,
    zoom,
    bearing: 0,
    mode: "street",
  };
}
