import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BackupApiError,
  exportBackup,
  importBackupOverwrite,
  type BackupDocument,
} from "./backup";

describe("backup API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports the current backup document", async () => {
    const backup = backupDocument();
    const fetchMock = mockFetchJson(backup);

    const result = await exportBackup();
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/backup/export");
    expect(init?.method).toBe("GET");
    expect(result).toEqual(backup);
  });

  it("imports backups with explicit overwrite mode", async () => {
    const backup = backupDocument();
    const fetchMock = mockFetchJson({
      mode: "overwrite",
      app_state: 1,
      painted_cells: 1,
      home_location: true,
    });

    const result = await importBackupOverwrite(backup);
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/backup/import?mode=overwrite");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(backup));
    expect(result).toEqual({
      mode: "overwrite",
      app_state: 1,
      painted_cells: 1,
      home_location: true,
    });
  });

  it("throws structured request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((...args: Parameters<typeof fetch>) => {
        void args;

        return Promise.resolve(
          jsonResponse(
            {
              error: "invalid_backup",
              message: "backup format must be 'foggy_map.backup'",
            },
            400,
          ),
        );
      }),
    );

    await expect(importBackupOverwrite(backupDocument())).rejects.toMatchObject({
      status: 400,
      errorCode: "invalid_backup",
    } satisfies Partial<BackupApiError>);
  });
});

function backupDocument(): BackupDocument {
  return {
    format: "foggy_map.backup",
    version: 1,
    exported_at: "2026-05-09T00:00:00.000Z",
    app_state: [
      {
        key: "map.view",
        value: {
          center: [37.6173, 55.7558],
          zoom: 12,
        },
      },
    ],
    home_location: {
      longitude: 37.6173,
      latitude: 55.7558,
      zoom: 14,
    },
    painted_cells: [
      {
        h3_id: "8b2a100d2db6fff",
        resolution: 11,
        centroid_lng: 37.6173,
        centroid_lat: 55.7558,
      },
    ],
  };
}

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
