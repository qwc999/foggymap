import type { HomeLocation, HomeLocationInput } from "@/api/homeLocation";
import type { LngLat } from "@/geo/h3Helpers";
import type { MapViewState } from "@/state/mapViewState";

export interface HomeLocationState {
  longitude: number;
  latitude: number;
  zoom: number | null;
  updatedAt?: string;
}

export function normalizeHomeLocation(
  homeLocation: HomeLocation | null,
): HomeLocationState | null {
  if (
    !homeLocation ||
    !isValidLongitude(homeLocation.longitude) ||
    !isValidLatitude(homeLocation.latitude)
  ) {
    return null;
  }

  return {
    longitude: homeLocation.longitude,
    latitude: homeLocation.latitude,
    zoom: isValidZoom(homeLocation.zoom) ? homeLocation.zoom : null,
    updatedAt: homeLocation.updated_at,
  };
}

export function createHomeLocationInputFromMapViewState(
  mapViewState: MapViewState,
): HomeLocationInput {
  return {
    longitude: mapViewState.center[0],
    latitude: mapViewState.center[1],
    zoom: mapViewState.zoom,
  };
}

export function createHomeLocationInputFromLngLat(
  lngLat: LngLat,
  zoom: number,
): HomeLocationInput {
  return {
    longitude: lngLat.lng,
    latitude: lngLat.lat,
    zoom,
  };
}

export function createMapViewStateForHomeLocation(
  currentMapViewState: MapViewState,
  homeLocation: HomeLocationState,
): MapViewState {
  return {
    ...currentMapViewState,
    center: [homeLocation.longitude, homeLocation.latitude],
    zoom: homeLocation.zoom ?? currentMapViewState.zoom,
  };
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidZoom(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
