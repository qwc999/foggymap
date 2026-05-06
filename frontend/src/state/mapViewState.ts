import type { JsonValue } from "@/api/appState";
import type { MapMode } from "@/config/mapProviders";

export const MAP_VIEW_STATE_KEY = "map.view";

export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  mode: MapMode;
}

export const DEFAULT_MAP_VIEW_STATE: MapViewState = {
  center: [37.6173, 55.7558],
  zoom: 11,
  bearing: 0,
  mode: "street",
};

export function normalizeMapViewState(value: JsonValue | null): MapViewState {
  if (!isJsonObject(value)) {
    return { ...DEFAULT_MAP_VIEW_STATE };
  }

  return {
    center: readCenter(value.center) ?? DEFAULT_MAP_VIEW_STATE.center,
    zoom: readFiniteNumber(value.zoom) ?? DEFAULT_MAP_VIEW_STATE.zoom,
    bearing: readFiniteNumber(value.bearing) ?? DEFAULT_MAP_VIEW_STATE.bearing,
    mode: readMapMode(value.mode) ?? DEFAULT_MAP_VIEW_STATE.mode,
  };
}

export function serializeMapViewState(state: MapViewState): JsonValue {
  return {
    center: [state.center[0], state.center[1]],
    zoom: state.zoom,
    bearing: state.bearing,
    mode: state.mode,
  };
}

export function getMapViewStateSignature(state: MapViewState): string {
  return JSON.stringify(serializeMapViewState(state));
}

export function areMapViewStatesEqual(
  left: MapViewState,
  right: MapViewState,
): boolean {
  return (
    left.mode === right.mode &&
    nearlyEqual(left.center[0], right.center[0]) &&
    nearlyEqual(left.center[1], right.center[1]) &&
    nearlyEqual(left.zoom, right.zoom) &&
    nearlyEqual(left.bearing, right.bearing)
  );
}

function readCenter(value: JsonValue | undefined): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const [lng, lat] = value;

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }

  return [lng, lat];
}

function readFiniteNumber(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMapMode(value: JsonValue | undefined): MapMode | null {
  return value === "street" || value === "satellite" ? value : null;
}

function isJsonObject(value: JsonValue | null): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}
