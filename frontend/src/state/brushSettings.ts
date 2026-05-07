import type { JsonValue } from "@/api/appState";
import {
  DEFAULT_BRUSH_RADIUS_METERS,
  MAX_BRUSH_RADIUS_METERS,
  MIN_BRUSH_RADIUS_METERS,
} from "@/config/h3";

export const BRUSH_RADIUS_STATE_KEY = "brush.radiusMeters";
export const BRUSH_RADIUS_STEP_METERS = 5;

export function normalizeBrushRadiusMeters(value: JsonValue | null): number {
  return sanitizeBrushRadiusMeters(
    typeof value === "number" ? value : DEFAULT_BRUSH_RADIUS_METERS,
  );
}

export function sanitizeBrushRadiusMeters(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BRUSH_RADIUS_METERS;
  }

  return Math.max(
    MIN_BRUSH_RADIUS_METERS,
    Math.min(MAX_BRUSH_RADIUS_METERS, Math.round(value)),
  );
}

export function serializeBrushRadiusMeters(radiusMeters: number): JsonValue {
  return sanitizeBrushRadiusMeters(radiusMeters);
}
