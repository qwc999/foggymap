import { describe, expect, it } from "vitest";

describe("frontend test runner", () => {
  it("runs inside the Docker frontend service", () => {
    expect("foggy_map").toContain("map");
  });
});
