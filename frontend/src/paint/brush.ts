import { getResolution } from "h3-js";

import type { CellRefInput, PaintCellInput } from "@/api/paintedCells";
import { h3CellToLngLat } from "@/geo/h3Helpers";

export const PAINTED_CELLS_API_BATCH_SIZE = 10_000;

export type BrushMode = "paint" | "erase";

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

export function collectExistingPaintedH3Ids(
  existingH3Ids: ReadonlySet<string>,
  brushH3Ids: Iterable<string>,
): string[] {
  const existingBrushH3Ids: string[] = [];
  const seen = new Set<string>();

  for (const h3Id of brushH3Ids) {
    if (seen.has(h3Id) || !existingH3Ids.has(h3Id)) {
      continue;
    }

    seen.add(h3Id);
    existingBrushH3Ids.push(h3Id);
  }

  return existingBrushH3Ids;
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

export function removePaintedH3Ids(
  currentH3Ids: readonly string[],
  removedH3Ids: Iterable<string>,
): string[] {
  const removed = new Set(removedH3Ids);

  if (removed.size === 0) {
    return [...currentH3Ids];
  }

  return currentH3Ids.filter((h3Id) => !removed.has(h3Id));
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

export function createCellRefInputs(h3Ids: Iterable<string>): CellRefInput[] {
  return Array.from(h3Ids, (h3Id) => ({
    h3_id: h3Id,
    resolution: getResolution(h3Id),
  }));
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

export function chunkCellRefInputs(
  cells: readonly CellRefInput[],
  batchSize = PAINTED_CELLS_API_BATCH_SIZE,
): CellRefInput[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Painted cells batch size must be a positive integer");
  }

  const chunks: CellRefInput[][] = [];

  for (let start = 0; start < cells.length; start += batchSize) {
    chunks.push(cells.slice(start, start + batchSize));
  }

  return chunks;
}
