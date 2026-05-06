import { describe, expect, it } from "vitest";

import {
  areMapViewStatesEqual,
  DEFAULT_MAP_VIEW_STATE,
  getMapViewStateSignature,
  normalizeMapViewState,
  serializeMapViewState,
} from "./mapViewState";

describe("map view state helpers", () => {
  it("normalizes stored map state values", () => {
    expect(
      normalizeMapViewState({
        center: [30.25, 59.93],
        zoom: 13.5,
        bearing: 12,
        mode: "satellite",
      }),
    ).toEqual({
      center: [30.25, 59.93],
      zoom: 13.5,
      bearing: 12,
      mode: "satellite",
    });
  });

  it("falls back for invalid stored fields independently", () => {
    expect(
      normalizeMapViewState({
        center: [200, 59.93],
        zoom: 14,
        bearing: "north",
        mode: "unknown",
      }),
    ).toEqual({
      center: DEFAULT_MAP_VIEW_STATE.center,
      zoom: 14,
      bearing: DEFAULT_MAP_VIEW_STATE.bearing,
      mode: DEFAULT_MAP_VIEW_STATE.mode,
    });
  });

  it("serializes state as JSON-compatible app state", () => {
    expect(
      serializeMapViewState({
        center: [37.6173, 55.7558],
        zoom: 11,
        bearing: 0,
        mode: "street",
      }),
    ).toEqual({
      center: [37.6173, 55.7558],
      zoom: 11,
      bearing: 0,
      mode: "street",
    });
  });

  it("creates stable signatures for save deduplication", () => {
    const state = {
      center: [37.6173, 55.7558] as [number, number],
      zoom: 11,
      bearing: 0,
      mode: "street" as const,
    };

    expect(getMapViewStateSignature(state)).toBe(
      JSON.stringify(serializeMapViewState(state)),
    );
  });

  it("compares map states with small coordinate tolerance", () => {
    expect(
      areMapViewStatesEqual(
        {
          center: [37.6173001, 55.7558001],
          zoom: 11.0000001,
          bearing: 0,
          mode: "street",
        },
        {
          center: [37.6173002, 55.7558002],
          zoom: 11.0000002,
          bearing: 0,
          mode: "street",
        },
      ),
    ).toBe(true);
  });
});
