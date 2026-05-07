import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRUSH_RADIUS_METERS,
  MAX_BRUSH_RADIUS_METERS,
  MIN_BRUSH_RADIUS_METERS,
} from "@/config/h3";

import {
  BRUSH_RADIUS_STATE_KEY,
  normalizeBrushRadiusMeters,
  sanitizeBrushRadiusMeters,
  serializeBrushRadiusMeters,
} from "./brushSettings";

describe("brush settings helpers", () => {
  it("uses the default radius for missing or invalid stored values", () => {
    expect(BRUSH_RADIUS_STATE_KEY).toBe("brush.radiusMeters");
    expect(normalizeBrushRadiusMeters(null)).toBe(DEFAULT_BRUSH_RADIUS_METERS);
    expect(normalizeBrushRadiusMeters("large")).toBe(DEFAULT_BRUSH_RADIUS_METERS);
    expect(sanitizeBrushRadiusMeters(Number.NaN)).toBe(DEFAULT_BRUSH_RADIUS_METERS);
  });

  it("clamps brush radius to the interactive range", () => {
    expect(normalizeBrushRadiusMeters(MIN_BRUSH_RADIUS_METERS - 1)).toBe(
      MIN_BRUSH_RADIUS_METERS,
    );
    expect(normalizeBrushRadiusMeters(MAX_BRUSH_RADIUS_METERS + 1)).toBe(
      MAX_BRUSH_RADIUS_METERS,
    );
  });

  it("rounds and serializes brush radius values", () => {
    expect(normalizeBrushRadiusMeters(42.6)).toBe(43);
    expect(serializeBrushRadiusMeters(42.2)).toBe(42);
  });
});
