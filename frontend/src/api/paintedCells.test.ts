import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PaintedCellsApiError,
  buildPaintedCellsBboxUrl,
  loadPaintedCellsInBbox,
  paintCells,
  type PaintCellInput,
} from "./paintedCells";

describe("painted cells API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads painted cells for a bbox", async () => {
    const fetchMock = mockFetchJson({
      cells: [
        {
          h3_id: "8b11aa7abdadfff",
          resolution: 11,
          centroid_lng: 37.6173,
          centroid_lat: 55.7558,
          painted_at: "2026-05-06T18:00:00.000Z",
        },
      ],
      limit: 500,
      truncated: false,
    });

    const result = await loadPaintedCellsInBbox({
      west: 37,
      south: 55,
      east: 38,
      north: 56,
      limit: 500,
    });
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/painted-cells?west=37&south=55&east=38&north=56&limit=500");
    expect(init?.method).toBe("GET");
    expect(result.cells).toHaveLength(1);
    expect(result.limit).toBe(500);
    expect(result.truncated).toBe(false);
  });

  it("builds bbox URLs without optional query values", () => {
    expect(
      buildPaintedCellsBboxUrl({
        west: -180,
        south: -90,
        east: 180,
        north: 90,
      }),
    ).toBe("/api/painted-cells?west=-180&south=-90&east=180&north=90");
  });

  it("sends paint batches to the backend", async () => {
    const fetchMock = mockFetchJson({
      requested: 1,
      changed: 1,
    });
    const cells: PaintCellInput[] = [
      {
        h3_id: "8b11aa7abdadfff",
        resolution: 11,
        centroid_lng: 37.6173,
        centroid_lat: 55.7558,
      },
    ];

    const result = await paintCells(cells);
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/painted-cells/paint");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ cells }));
    expect(result).toEqual({ requested: 1, changed: 1 });
  });

  it("throws structured request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((...args: Parameters<typeof fetch>) => {
        void args;

        return Promise.resolve(
          jsonResponse(
            {
              error: "invalid_painted_cells_input",
              message: "painted cells batch must contain at most 10000 cells",
            },
            400,
          ),
        );
      }),
    );

    await expect(paintCells([])).rejects.toMatchObject({
      status: 400,
      errorCode: "invalid_painted_cells_input",
    } satisfies Partial<PaintedCellsApiError>);
  });
});

function mockFetchJson(body: unknown) {
  const fetchMock = vi.fn((...args: Parameters<typeof fetch>) => {
    void args;

    return Promise.resolve(jsonResponse(body, 200));
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
