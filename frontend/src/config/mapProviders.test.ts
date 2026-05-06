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

  it("returns a satellite default with NASA GIBS tiles and attribution", () => {
    const provider = getDefaultProvider("satellite");

    expect(provider.id).toBe("nasa-gibs-modis-terra-true-color");
    expect(provider.status).toBe("ready");
    expect(provider.attribution).toContain("NASA GIBS");
    expect(provider.tileUrlTemplates).toHaveLength(1);
    expect(provider.tileUrlTemplates[0]).toContain("GoogleMapsCompatible_Level9");
    expect(provider.maxZoom).toBe(9);
  });

  it("documents satellite provider limitations in the provider config", () => {
    const provider = getDefaultProvider("satellite");
    const notes = provider.notes.join(" ");

    expect(notes).toContain("305.75 meters per pixel");
    expect(notes).toContain("not high-resolution city imagery");
    expect(notes).toContain("Online service only");
    expect(notes).toContain("OpenAerialMap");
  });

  it("keeps satellite mode represented by the same provider abstraction", () => {
    const providers = getProvidersForMode("satellite");

    expect(providers).toHaveLength(1);
    expect(providers[0]?.tileUrlTemplates).toHaveLength(1);
  });

  it("falls back to mode default when preferred provider is missing", () => {
    expect(resolveProvider("street", "missing-provider").id).toBe("osm-raster-dev");
  });

  it("falls back to mode default when preferred provider belongs to another mode", () => {
    expect(resolveProvider("satellite", "osm-raster-dev").id).toBe(
      "nasa-gibs-modis-terra-true-color",
    );
  });
});
