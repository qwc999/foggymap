import { mergePaintedH3Ids, type BrushMode } from "./brush";

export interface PaintUndoAction {
  mode: BrushMode;
  h3Ids: string[];
}

export interface PaintUndoMutation {
  paintH3Ids: string[];
  eraseH3Ids: string[];
}

export interface PaintUndoHistory {
  actions: PaintUndoAction[];
  currentAction: PaintUndoAction | null;
}

export function createPaintUndoHistory(): PaintUndoHistory {
  return {
    actions: [],
    currentAction: null,
  };
}

export function appendPaintUndoCells(
  currentAction: PaintUndoAction | null,
  mode: BrushMode,
  h3Ids: readonly string[],
): PaintUndoAction | null {
  if (h3Ids.length === 0) {
    return currentAction;
  }

  if (!currentAction || currentAction.mode !== mode) {
    return {
      mode,
      h3Ids: [...new Set(h3Ids)],
    };
  }

  return {
    mode,
    h3Ids: mergePaintedH3Ids(currentAction.h3Ids, h3Ids),
  };
}

export function recordPaintUndoCells(
  history: PaintUndoHistory,
  mode: BrushMode,
  h3Ids: readonly string[],
): number {
  if (h3Ids.length === 0) {
    return history.actions.length;
  }

  if (history.currentAction && history.currentAction.mode !== mode) {
    finalizePaintUndoAction(history);
  }

  history.currentAction = appendPaintUndoCells(history.currentAction, mode, h3Ids);

  return history.actions.length;
}

export function finalizePaintUndoAction(history: PaintUndoHistory): number {
  const action = history.currentAction;

  if (!action || action.h3Ids.length === 0) {
    history.currentAction = null;
    return history.actions.length;
  }

  history.actions.push(action);
  history.currentAction = null;

  return history.actions.length;
}

export function popPaintUndoAction(history: PaintUndoHistory): PaintUndoAction | null {
  finalizePaintUndoAction(history);

  return history.actions.pop() ?? null;
}

export function clearPaintUndoHistory(history: PaintUndoHistory): void {
  history.actions = [];
  history.currentAction = null;
}

export function getPaintUndoStackSize(history: PaintUndoHistory): number {
  return history.actions.length;
}

export function createUndoMutation(action: PaintUndoAction): PaintUndoMutation {
  if (action.mode === "paint") {
    return {
      paintH3Ids: [],
      eraseH3Ids: [...action.h3Ids],
    };
  }

  return {
    paintH3Ids: [...action.h3Ids],
    eraseH3Ids: [],
  };
}
