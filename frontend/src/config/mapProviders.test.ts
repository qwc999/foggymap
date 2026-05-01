import { describe, expect, it } from "vitest";

import {
  getDefaultProvider,
  getProvidersForMode,
  resolveProvider,
} from "./mapProviders";

describe("map provider config", () => {
  it("returns a street default with tile templates and attribution", () => {
    const provider = getDefaultProvider("street");

    expect(provider.id).toBe("osm-raster-dev");
    expect(provider.tileUrlTemplates).toHaveLength(1);
    expect(provider.attribution).toContain("OpenStreetMap");
  });

  it("keeps satellite mode represented by the same provider abstraction", () => {
    const providers = getProvidersForMode("satellite");

    expect(providers).toHaveLength(1);
    expect(providers[0]?.status).toBe("placeholder");
  });

  it("falls back to mode default when preferred provider is missing", () => {
    expect(resolveProvider("street", "missing-provider").id).toBe("osm-raster-dev");
  });

  it("falls back to mode default when preferred provider belongs to another mode", () => {
    expect(resolveProvider("satellite", "osm-raster-dev").id).toBe(
      "satellite-unconfigured",
    );
  });
});
