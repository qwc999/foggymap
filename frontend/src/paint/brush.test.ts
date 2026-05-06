import { describe, expect, it } from "vitest";

import { DEFAULT_H3_RESOLUTION } from "@/config/h3";
import { getH3DiskForLngLat, lngLatToH3Cell } from "@/geo/h3Helpers";

import {
  chunkPaintCellInputs,
  collectNewPaintedH3Ids,
  createPaintCellInputs,
  mergePaintedH3Ids,
} from "./brush";

const MOSCOW_CENTER = {
  lng: 37.6173,
  lat: 55.7558,
};

describe("brush painting helpers", () => {
  it("collects only cells that are not already painted or duplicated", () => {
    const existing = new Set(["cell-a"]);
    const next = collectNewPaintedH3Ids(existing, [
      "cell-a",
      "cell-b",
      "cell-b",
      "cell-c",
    ]);

    expect(next).toEqual(["cell-b", "cell-c"]);
  });

  it("merges painted cells while preserving existing order", () => {
    const merged = mergePaintedH3Ids(["cell-a", "cell-b"], ["cell-b", "cell-c"]);

    expect(merged).toEqual(["cell-a", "cell-b", "cell-c"]);
  });

  it("creates backend paint payloads from H3 ids", () => {
    const h3Id = lngLatToH3Cell(MOSCOW_CENTER);
    const [paintCell] = createPaintCellInputs([h3Id]);

    expect(paintCell).toMatchObject({
      h3_id: h3Id,
      resolution: DEFAULT_H3_RESOLUTION,
    });
    expect(paintCell?.centroid_lng).toBeCloseTo(MOSCOW_CENTER.lng, 3);
    expect(paintCell?.centroid_lat).toBeCloseTo(MOSCOW_CENTER.lat, 3);
  });

  it("supports brush disks larger than one H3 cell", () => {
    const brushCells = getH3DiskForLngLat(MOSCOW_CENTER, 50);
    const origin = lngLatToH3Cell(MOSCOW_CENTER);
    const newCells = collectNewPaintedH3Ids(new Set([origin]), brushCells);

    expect(brushCells).toHaveLength(7);
    expect(newCells).toHaveLength(6);
    expect(newCells).not.toContain(origin);
  });

  it("chunks paint payloads to the backend batch limit", () => {
    const cells = Array.from({ length: 5 }, (_, index) => ({
      h3_id: `cell-${index}`,
      resolution: DEFAULT_H3_RESOLUTION,
      centroid_lng: 37 + index * 0.001,
      centroid_lat: 55 + index * 0.001,
    }));

    expect(chunkPaintCellInputs(cells, 2)).toEqual([
      cells.slice(0, 2),
      cells.slice(2, 4),
      cells.slice(4),
    ]);
    expect(() => chunkPaintCellInputs(cells, 0)).toThrow("batch size");
  });
});
