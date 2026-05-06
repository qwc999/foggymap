import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, loadAppState, saveAppState } from "./appState";

describe("app state API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads typed app state values", async () => {
    const fetchMock = mockFetchJson({
      key: "map.viewport",
      value: { center: [37.6173, 55.7558], zoom: 11 },
    });

    const value = await loadAppState<{
      center: [number, number];
      zoom: number;
    }>("map.viewport");

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/app-state/map.viewport");
    expect(init?.method).toBe("GET");
    expect(value).toEqual({ center: [37.6173, 55.7558], zoom: 11 });
  });

  it("returns null when the backend has no value for a key", async () => {
    mockFetchJson({
      key: "map.viewport",
      value: null,
    });

    await expect(loadAppState("map.viewport")).resolves.toBeNull();
  });

  it("saves typed app state values", async () => {
    const fetchMock = mockFetchJson({
      key: "map.zoom",
      value: 12,
    });

    const value = await saveAppState("map.zoom", 12);
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/app-state/map.zoom");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify({ value: 12 }));
    expect(value).toBe(12);
  });

  it("throws structured request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((...args: Parameters<typeof fetch>) => {
        void args;

        return Promise.resolve(
          jsonResponse(
            {
              error: "invalid_app_state_key",
              message: "app state key contains unsupported character",
            },
            400,
          ),
        );
      }),
    );

    await expect(loadAppState("map viewport")).rejects.toMatchObject({
      status: 400,
      errorCode: "invalid_app_state_key",
    } satisfies Partial<ApiRequestError>);
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
