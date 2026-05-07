import { describe, expect, it } from "vitest";

import { createViewportPaintedH3Ids, getPaintedCellsBboxSignature } from "./viewport";

describe("painted cells viewport helpers", () => {
  it("creates stable bbox signatures with bounded coordinate precision", () => {
    expect(
      getPaintedCellsBboxSignature({
        west: 37.123456789,
        south: 55.987654321,
        east: 38.1,
        north: 56.2,
      }),
    ).toBe("37.123457:55.987654:38.100000:56.200000");
  });

  it("replaces viewport cells with loaded cells", () => {
    const visibleH3Ids = createViewportPaintedH3Ids(["loaded-a", "loaded-b"]);

    expect(visibleH3Ids).toEqual(["loaded-a", "loaded-b"]);
  });

  it("preserves local painted cells that are not in a stale load result", () => {
    const visibleH3Ids = createViewportPaintedH3Ids(
      ["loaded-a", "loaded-b"],
      ["loaded-b", "local-c"],
    );

    expect(visibleH3Ids).toEqual(["loaded-a", "loaded-b", "local-c"]);
  });
});
