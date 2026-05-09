import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppStatusView, type StatusItem } from "./AppStatusView";

describe("AppStatusView", () => {
  it("renders status rows and map return control", () => {
    const items: StatusItem[] = [
      { label: "Backend", value: "available", tone: "ok" },
      { label: "Paint", value: "saving", tone: "pending" },
      { label: "Backup", value: "error", tone: "error" },
    ];

    const html = renderToStaticMarkup(
      <AppStatusView items={items} onBackToMap={vi.fn()} />,
    );

    expect(html).toContain('data-testid="app-status-view"');
    expect(html).toContain('data-testid="back-to-map"');
    expect(html).toContain("Backend");
    expect(html).toContain("available");
    expect(html).toContain("Paint");
    expect(html).toContain("saving");
    expect(html).toContain("Backup");
    expect(html).toContain("error");
    expect(html).toContain("text-emerald-300");
    expect(html).toContain("text-amber-300");
    expect(html).toContain("text-red-300");
  });
});
