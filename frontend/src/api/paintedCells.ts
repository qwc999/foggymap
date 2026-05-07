export interface PaintCellInput {
  h3_id: string;
  resolution: number;
  centroid_lng: number;
  centroid_lat: number;
}

export interface PaintedCell extends PaintCellInput {
  painted_at: string;
}

export interface PaintedCellsBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface PaintedCellsViewportQuery extends PaintedCellsBbox {
  limit?: number;
}

export interface PaintedCellsLoadResult {
  cells: PaintedCell[];
  limit: number;
  truncated: boolean;
}

interface PaintedCellsResponse {
  cells: PaintedCell[];
  limit?: number;
  truncated?: boolean;
}

interface BatchMutationResponse {
  requested: number;
  changed: number;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export class PaintedCellsApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "PaintedCellsApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function loadPaintedCellsInBbox(
  query: PaintedCellsViewportQuery,
): Promise<PaintedCellsLoadResult> {
  const response = await fetch(buildPaintedCellsBboxUrl(query), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as PaintedCellsResponse;
  return {
    cells: body.cells,
    limit: body.limit ?? query.limit ?? body.cells.length,
    truncated: body.truncated ?? false,
  };
}

export async function paintCells(
  cells: PaintCellInput[],
): Promise<BatchMutationResponse> {
  const response = await fetch("/api/painted-cells/paint", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cells }),
  });

  await throwIfRequestFailed(response);

  return (await response.json()) as BatchMutationResponse;
}

export function buildPaintedCellsBboxUrl(query: PaintedCellsViewportQuery): string {
  const searchParams = new URLSearchParams({
    west: String(query.west),
    south: String(query.south),
    east: String(query.east),
    north: String(query.north),
  });

  if (query.limit !== undefined) {
    searchParams.set("limit", String(query.limit));
  }

  return `/api/painted-cells?${searchParams.toString()}`;
}

async function throwIfRequestFailed(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const fallbackMessage = `API request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as ApiErrorResponse;
    throw new PaintedCellsApiError(
      response.status,
      body.message ?? fallbackMessage,
      body.error,
    );
  } catch (error) {
    if (error instanceof PaintedCellsApiError) {
      throw error;
    }

    throw new PaintedCellsApiError(response.status, fallbackMessage);
  }
}
