import { describe, expect, it } from "vitest";

import {
  appendPaintUndoCells,
  clearPaintUndoHistory,
  createPaintUndoHistory,
  createUndoMutation,
  finalizePaintUndoAction,
  getPaintUndoStackSize,
  popPaintUndoAction,
  recordPaintUndoCells,
} from "./undo";

describe("paint undo helpers", () => {
  it("keeps unique H3 ids for one paint action", () => {
    const action = appendPaintUndoCells(
      { mode: "paint", h3Ids: ["cell-a", "cell-b"] },
      "paint",
      ["cell-b", "cell-c"],
    );

    expect(action).toEqual({
      mode: "paint",
      h3Ids: ["cell-a", "cell-b", "cell-c"],
    });
  });

  it("starts a new action when the brush mode changes", () => {
    const action = appendPaintUndoCells({ mode: "paint", h3Ids: ["cell-a"] }, "erase", [
      "cell-b",
      "cell-b",
    ]);

    expect(action).toEqual({
      mode: "erase",
      h3Ids: ["cell-b"],
    });
  });

  it("plans the opposite mutation for paint and erase actions", () => {
    expect(createUndoMutation({ mode: "paint", h3Ids: ["cell-a"] })).toEqual({
      paintH3Ids: [],
      eraseH3Ids: ["cell-a"],
    });
    expect(createUndoMutation({ mode: "erase", h3Ids: ["cell-b"] })).toEqual({
      paintH3Ids: ["cell-b"],
      eraseH3Ids: [],
    });
  });

  it("stores completed undo actions in memory only", () => {
    const history = createPaintUndoHistory();

    expect(recordPaintUndoCells(history, "paint", ["cell-a"])).toBe(0);
    expect(recordPaintUndoCells(history, "paint", ["cell-b", "cell-a"])).toBe(0);
    expect(finalizePaintUndoAction(history)).toBe(1);
    expect(getPaintUndoStackSize(history)).toBe(1);
    expect(popPaintUndoAction(history)).toEqual({
      mode: "paint",
      h3Ids: ["cell-a", "cell-b"],
    });
    expect(getPaintUndoStackSize(history)).toBe(0);
  });

  it("finalizes the previous action when the mode changes", () => {
    const history = createPaintUndoHistory();

    recordPaintUndoCells(history, "paint", ["cell-a"]);
    expect(recordPaintUndoCells(history, "erase", ["cell-b"])).toBe(1);

    expect(popPaintUndoAction(history)).toEqual({
      mode: "erase",
      h3Ids: ["cell-b"],
    });
    expect(popPaintUndoAction(history)).toEqual({
      mode: "paint",
      h3Ids: ["cell-a"],
    });
  });

  it("clears in-memory undo history", () => {
    const history = createPaintUndoHistory();

    recordPaintUndoCells(history, "paint", ["cell-a"]);
    finalizePaintUndoAction(history);
    clearPaintUndoHistory(history);

    expect(getPaintUndoStackSize(history)).toBe(0);
    expect(popPaintUndoAction(history)).toBeNull();
  });
});
