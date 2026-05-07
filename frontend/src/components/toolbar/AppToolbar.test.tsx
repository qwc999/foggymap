import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppToolbar } from "./AppToolbar";

describe("AppToolbar", () => {
  it("renders map, tool and brush size controls", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode="paint"
        brushRadiusMeters={45}
        mapMode="satellite"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onMapModeChange={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="app-toolbar"');
    expect(html).toContain('data-testid="satellite-map-mode"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="paint-mode"');
    expect(html).toContain('data-testid="erase-mode"');
    expect(html).toContain('data-testid="brush-size-range"');
    expect(html).toContain('data-testid="brush-size-input"');
    expect(html).toContain('value="45"');
  });

  it("keeps the home button disabled until home location is implemented", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode={null}
        brushRadiusMeters={30}
        mapMode="street"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onMapModeChange={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="home-placeholder"');
    expect(html).toContain("disabled");
  });
});
