import type { PaintedCellsBbox } from "@/api/paintedCells";

export const PAINTED_CELLS_VIEWPORT_DEBOUNCE_MS = 350;
export const PAINTED_CELLS_VIEWPORT_QUERY_LIMIT = 20_000;

export function getPaintedCellsBboxSignature({
  west,
  south,
  east,
  north,
}: PaintedCellsBbox): string {
  return [west, south, east, north].map((value) => value.toFixed(6)).join(":");
}

export function createViewportPaintedH3Ids(
  loadedH3Ids: Iterable<string>,
  localPaintedH3Ids: Iterable<string> = [],
  localErasedH3Ids: Iterable<string> = [],
): string[] {
  const visibleH3Ids = new Set<string>();

  for (const h3Id of loadedH3Ids) {
    visibleH3Ids.add(h3Id);
  }

  for (const h3Id of localPaintedH3Ids) {
    visibleH3Ids.add(h3Id);
  }

  for (const h3Id of localErasedH3Ids) {
    visibleH3Ids.delete(h3Id);
  }

  return [...visibleH3Ids];
}
