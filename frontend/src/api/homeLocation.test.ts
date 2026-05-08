import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HomeLocationApiError,
  clearHomeLocation,
  loadHomeLocation,
  saveHomeLocation,
  type HomeLocationInput,
} from "./homeLocation";

describe("home location API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the saved home location", async () => {
    const fetchMock = mockFetchJson({
      home_location: {
        longitude: 37.6173,
        latitude: 55.7558,
        zoom: 14,
        updated_at: "2026-05-08T10:00:00.000Z",
      },
    });

    const homeLocation = await loadHomeLocation();
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/home-location");
    expect(init?.method).toBe("GET");
    expect(homeLocation).toMatchObject({
      longitude: 37.6173,
      latitude: 55.7558,
      zoom: 14,
    });
  });

  it("returns null when no home location exists", async () => {
    mockFetchJson({ home_location: null });

    await expect(loadHomeLocation()).resolves.toBeNull();
  });

  it("saves the home location", async () => {
    const fetchMock = mockFetchJson({
      home_location: {
        longitude: -73.9857,
        latitude: 40.7484,
        zoom: null,
        updated_at: "2026-05-08T10:01:00.000Z",
      },
    });
    const input: HomeLocationInput = {
      longitude: -73.9857,
      latitude: 40.7484,
      zoom: null,
    };

    const savedHomeLocation = await saveHomeLocation(input);
    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/home-location");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(input));
    expect(savedHomeLocation).toMatchObject(input);
  });

  it("clears the home location", async () => {
    const fetchMock = mockFetchJson({ home_location: null });

    await expect(clearHomeLocation()).resolves.toBeNull();

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe("/api/home-location");
    expect(init?.method).toBe("DELETE");
  });

  it("throws structured request errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((...args: Parameters<typeof fetch>) => {
        void args;

        return Promise.resolve(
          jsonResponse(
            {
              error: "invalid_home_location_input",
              message: "latitude must be a finite latitude between -90 and 90",
            },
            400,
          ),
        );
      }),
    );

    await expect(
      saveHomeLocation({ longitude: 37.6173, latitude: 95, zoom: 14 }),
    ).rejects.toMatchObject({
      status: 400,
      errorCode: "invalid_home_location_input",
    } satisfies Partial<HomeLocationApiError>);
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
