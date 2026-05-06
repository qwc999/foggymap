import { getResolution } from "h3-js";

import type { PaintCellInput } from "@/api/paintedCells";
import { h3CellToLngLat } from "@/geo/h3Helpers";

export const PAINTED_CELLS_API_BATCH_SIZE = 10_000;

export function collectNewPaintedH3Ids(
  existingH3Ids: ReadonlySet<string>,
  brushH3Ids: Iterable<string>,
): string[] {
  const nextH3Ids: string[] = [];
  const seen = new Set(existingH3Ids);

  for (const h3Id of brushH3Ids) {
    if (seen.has(h3Id)) {
      continue;
    }

    seen.add(h3Id);
    nextH3Ids.push(h3Id);
  }

  return nextH3Ids;
}

export function mergePaintedH3Ids(
  currentH3Ids: readonly string[],
  nextH3Ids: Iterable<string>,
): string[] {
  const merged = new Set(currentH3Ids);
  let changed = false;

  for (const h3Id of nextH3Ids) {
    if (merged.has(h3Id)) {
      continue;
    }

    merged.add(h3Id);
    changed = true;
  }

  return changed ? [...merged] : [...currentH3Ids];
}

export function createPaintCellInputs(h3Ids: Iterable<string>): PaintCellInput[] {
  return Array.from(h3Ids, (h3Id) => {
    const centroid = h3CellToLngLat(h3Id);

    return {
      h3_id: h3Id,
      resolution: getResolution(h3Id),
      centroid_lng: centroid.lng,
      centroid_lat: centroid.lat,
    };
  });
}

export function chunkPaintCellInputs(
  cells: readonly PaintCellInput[],
  batchSize = PAINTED_CELLS_API_BATCH_SIZE,
): PaintCellInput[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Painted cells batch size must be a positive integer");
  }

  const chunks: PaintCellInput[][] = [];

  for (let start = 0; start < cells.length; start += batchSize) {
    chunks.push(cells.slice(start, start + batchSize));
  }

  return chunks;
}
