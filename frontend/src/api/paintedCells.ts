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

interface PaintedCellsResponse {
  cells: PaintedCell[];
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
  bbox: PaintedCellsBbox,
): Promise<PaintedCell[]> {
  const response = await fetch(paintedCellsUrl(bbox), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as PaintedCellsResponse;
  return body.cells;
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

function paintedCellsUrl(bbox: PaintedCellsBbox): string {
  const searchParams = new URLSearchParams({
    west: String(bbox.west),
    south: String(bbox.south),
    east: String(bbox.east),
    north: String(bbox.north),
  });

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
