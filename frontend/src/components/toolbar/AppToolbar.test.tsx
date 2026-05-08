import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppToolbar } from "./AppToolbar";

describe("AppToolbar", () => {
  it("renders map, tool and brush size controls", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode="paint"
        brushRadiusMeters={45}
        hasHomeLocation
        homePickModeEnabled={false}
        homeRadiusPainting={false}
        homeRadiusPreviewEnabled={false}
        mapMode="satellite"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onGoHome={vi.fn()}
        onMapModeChange={vi.fn()}
        onRequestHomeRadiusPaint={vi.fn()}
        onSetHomeFromCenter={vi.fn()}
        onToggleHomeRadiusPreview={vi.fn()}
        onToggleHomePickMode={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="app-toolbar"');
    expect(html).toContain('data-testid="satellite-map-mode"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="paint-mode"');
    expect(html).toContain('data-testid="erase-mode"');
    expect(html).toContain('data-testid="home-button"');
    expect(html).toContain('data-testid="set-home-center"');
    expect(html).toContain('data-testid="pick-home-on-map"');
    expect(html).toContain('data-testid="home-radius-preview"');
    expect(html).toContain('data-testid="paint-home-radius"');
    expect(html).toContain('data-testid="brush-size-range"');
    expect(html).toContain('data-testid="brush-size-input"');
    expect(html).toContain('value="45"');
  });

  it("disables the home button until a home location exists", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode={null}
        brushRadiusMeters={30}
        hasHomeLocation={false}
        homePickModeEnabled={false}
        homeRadiusPainting={false}
        homeRadiusPreviewEnabled={false}
        mapMode="street"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onGoHome={vi.fn()}
        onMapModeChange={vi.fn()}
        onRequestHomeRadiusPaint={vi.fn()}
        onSetHomeFromCenter={vi.fn()}
        onToggleHomeRadiusPreview={vi.fn()}
        onToggleHomePickMode={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="home-button"');
    expect(html).toContain("disabled");
  });

  it("marks map picking as active when requested", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode={null}
        brushRadiusMeters={30}
        hasHomeLocation
        homePickModeEnabled
        homeRadiusPainting={false}
        homeRadiusPreviewEnabled={false}
        mapMode="street"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onGoHome={vi.fn()}
        onMapModeChange={vi.fn()}
        onRequestHomeRadiusPaint={vi.fn()}
        onSetHomeFromCenter={vi.fn()}
        onToggleHomeRadiusPreview={vi.fn()}
        onToggleHomePickMode={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="pick-home-on-map"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("marks the home radius preview as active", () => {
    const html = renderToStaticMarkup(
      <AppToolbar
        brushMode={null}
        brushRadiusMeters={30}
        hasHomeLocation
        homePickModeEnabled={false}
        homeRadiusPainting={false}
        homeRadiusPreviewEnabled
        mapMode="street"
        onBrushModeChange={vi.fn()}
        onBrushRadiusChange={vi.fn()}
        onGoHome={vi.fn()}
        onMapModeChange={vi.fn()}
        onRequestHomeRadiusPaint={vi.fn()}
        onSetHomeFromCenter={vi.fn()}
        onToggleHomeRadiusPreview={vi.fn()}
        onToggleHomePickMode={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="home-radius-preview"');
    expect(html).toContain('aria-pressed="true"');
  });
});
