import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, MapPinned, Satellite } from "lucide-react";

import { loadAppState, saveAppState, type JsonValue } from "@/api/appState";
import {
  eraseCells,
  loadPaintedCellsInBbox,
  paintCells,
  type PaintedCellsBbox,
} from "@/api/paintedCells";
import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import { DEFAULT_BRUSH_RADIUS_METERS } from "@/config/h3";
import type { MapMode } from "@/config/mapProviders";
import { cn } from "@/lib/utils";
import {
  chunkCellRefInputs,
  chunkPaintCellInputs,
  createCellRefInputs,
  createPaintCellInputs,
  removePaintedH3Ids,
  type BrushMode,
} from "@/paint/brush";
import {
  PAINTED_CELLS_VIEWPORT_DEBOUNCE_MS,
  PAINTED_CELLS_VIEWPORT_QUERY_LIMIT,
  createViewportPaintedH3Ids,
  getPaintedCellsBboxSignature,
} from "@/paint/viewport";
import {
  areMapViewStatesEqual,
  DEFAULT_MAP_VIEW_STATE,
  getMapViewStateSignature,
  MAP_VIEW_STATE_KEY,
  normalizeMapViewState,
  serializeMapViewState,
  type MapViewState,
} from "@/state/mapViewState";

type HealthState = "loading" | "ok" | "error";
type MapPersistenceState = "loading" | "saved" | "saving" | "error";
type PaintPersistenceState =
  | "idle"
  | "loading"
  | "saved"
  | "saving"
  | "limited"
  | "error";

export function App() {
  const [health, setHealth] = useState<HealthState>("loading");
  const [mapViewState, setMapViewState] =
    useState<MapViewState>(DEFAULT_MAP_VIEW_STATE);
  const [mapPersistenceState, setMapPersistenceState] =
    useState<MapPersistenceState>("loading");
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [paintedH3Ids, setPaintedH3Ids] = useState<string[]>([]);
  const [paintedCellsViewportBbox, setPaintedCellsViewportBbox] =
    useState<PaintedCellsBbox | null>(null);
  const [paintPersistenceState, setPaintPersistenceState] =
    useState<PaintPersistenceState>("idle");
  const lastPersistedMapStateSignatureRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);
  const paintedH3IdSetRef = useRef<Set<string>>(new Set());
  const pendingPaintH3IdsRef = useRef<Set<string>>(new Set());
  const pendingEraseH3IdsRef = useRef<Set<string>>(new Set());
  const isSavingPaintMutationsRef = useRef(false);
  const viewportLoadSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Backend health failed: ${response.status}`);
        }
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => {
        if (!cancelled) {
          setHealth(body.status === "ok" ? "ok" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadAppState<JsonValue>(MAP_VIEW_STATE_KEY)
      .then((storedValue) => {
        if (cancelled) {
          return;
        }

        const nextMapViewState = normalizeMapViewState(storedValue);

        lastPersistedMapStateSignatureRef.current =
          getMapViewStateSignature(nextMapViewState);
        setMapViewState(nextMapViewState);
        setMapPersistenceState("saved");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        lastPersistedMapStateSignatureRef.current =
          getMapViewStateSignature(DEFAULT_MAP_VIEW_STATE);
        setMapPersistenceState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mapPersistenceState === "loading") {
      return;
    }

    const signature = getMapViewStateSignature(mapViewState);

    if (signature === lastPersistedMapStateSignatureRef.current) {
      return;
    }

    const saveSequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = saveSequence;
    setMapPersistenceState("saving");

    const timeoutId = window.setTimeout(() => {
      saveAppState(MAP_VIEW_STATE_KEY, serializeMapViewState(mapViewState))
        .then(() => {
          if (saveSequenceRef.current !== saveSequence) {
            return;
          }

          lastPersistedMapStateSignatureRef.current = signature;
          setMapPersistenceState("saved");
        })
        .catch(() => {
          if (saveSequenceRef.current !== saveSequence) {
            return;
          }

          setMapPersistenceState("error");
        });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mapPersistenceState, mapViewState]);

  const replaceVisiblePaintedH3Ids = useCallback((h3Ids: readonly string[]) => {
    paintedH3IdSetRef.current = new Set(h3Ids);
    setPaintedH3Ids([...paintedH3IdSetRef.current]);
  }, []);

  const addVisiblePaintedH3Ids = useCallback((h3Ids: readonly string[]) => {
    const nextH3Ids: string[] = [];

    for (const h3Id of h3Ids) {
      if (paintedH3IdSetRef.current.has(h3Id)) {
        continue;
      }

      paintedH3IdSetRef.current.add(h3Id);
      nextH3Ids.push(h3Id);
    }

    if (nextH3Ids.length > 0) {
      setPaintedH3Ids([...paintedH3IdSetRef.current]);
    }

    return nextH3Ids;
  }, []);

  const removeVisiblePaintedH3Ids = useCallback((h3Ids: readonly string[]) => {
    const erasedH3Ids = h3Ids.filter((h3Id) => paintedH3IdSetRef.current.has(h3Id));

    if (erasedH3Ids.length > 0) {
      paintedH3IdSetRef.current = new Set(
        removePaintedH3Ids([...paintedH3IdSetRef.current], erasedH3Ids),
      );
      setPaintedH3Ids([...paintedH3IdSetRef.current]);
    }

    return erasedH3Ids;
  }, []);

  const flushPendingPaintMutations = useCallback(() => {
    if (
      isSavingPaintMutationsRef.current ||
      (pendingPaintH3IdsRef.current.size === 0 &&
        pendingEraseH3IdsRef.current.size === 0)
    ) {
      return;
    }

    const paintH3Ids = [...pendingPaintH3IdsRef.current];
    const eraseH3Ids = [...pendingEraseH3IdsRef.current];
    pendingPaintH3IdsRef.current.clear();
    pendingEraseH3IdsRef.current.clear();
    isSavingPaintMutationsRef.current = true;
    setPaintPersistenceState("saving");

    void (async () => {
      let shouldFlushAgain = false;

      try {
        const cellRefs = createCellRefInputs(eraseH3Ids);
        const cells = createPaintCellInputs(paintH3Ids);

        for (const batch of chunkCellRefInputs(cellRefs)) {
          await eraseCells(batch);
        }
        for (const batch of chunkPaintCellInputs(cells)) {
          await paintCells(batch);
        }

        shouldFlushAgain =
          pendingPaintH3IdsRef.current.size > 0 ||
          pendingEraseH3IdsRef.current.size > 0;
        setPaintPersistenceState("saved");
      } catch {
        for (const h3Id of paintH3Ids) {
          if (!pendingEraseH3IdsRef.current.has(h3Id)) {
            pendingPaintH3IdsRef.current.add(h3Id);
          }
        }
        for (const h3Id of eraseH3Ids) {
          if (!pendingPaintH3IdsRef.current.has(h3Id)) {
            pendingEraseH3IdsRef.current.add(h3Id);
          }
        }

        setPaintPersistenceState("error");
      } finally {
        isSavingPaintMutationsRef.current = false;

        if (shouldFlushAgain) {
          flushPendingPaintMutations();
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!paintedCellsViewportBbox) {
      return;
    }

    const loadSequence = viewportLoadSequenceRef.current + 1;
    viewportLoadSequenceRef.current = loadSequence;
    setPaintPersistenceState((currentState) =>
      currentState === "saving" ? currentState : "loading",
    );

    const timeoutId = window.setTimeout(() => {
      loadPaintedCellsInBbox({
        ...paintedCellsViewportBbox,
        limit: PAINTED_CELLS_VIEWPORT_QUERY_LIMIT,
      })
        .then((result) => {
          if (viewportLoadSequenceRef.current !== loadSequence) {
            return;
          }

          replaceVisiblePaintedH3Ids(
            createViewportPaintedH3Ids(
              result.cells.map((cell) => cell.h3_id),
              pendingPaintH3IdsRef.current,
              pendingEraseH3IdsRef.current,
            ),
          );
          setPaintPersistenceState((currentState) =>
            currentState === "saving"
              ? currentState
              : result.truncated
                ? "limited"
                : "saved",
          );
        })
        .catch(() => {
          if (viewportLoadSequenceRef.current !== loadSequence) {
            return;
          }

          setPaintPersistenceState("error");
        });
    }, PAINTED_CELLS_VIEWPORT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [paintedCellsViewportBbox, replaceVisiblePaintedH3Ids]);

  const handleMapViewStateChange = useCallback((nextMapViewState: MapViewState) => {
    setMapViewState((currentMapViewState) =>
      areMapViewStatesEqual(currentMapViewState, nextMapViewState)
        ? currentMapViewState
        : nextMapViewState,
    );
  }, []);

  const handleMapModeChange = useCallback((mode: MapMode) => {
    setMapViewState((currentMapViewState) =>
      currentMapViewState.mode === mode
        ? currentMapViewState
        : { ...currentMapViewState, mode },
    );
  }, []);

  const handlePaintedCellsViewportChange = useCallback((bbox: PaintedCellsBbox) => {
    setPaintedCellsViewportBbox((currentBbox) =>
      currentBbox &&
      getPaintedCellsBboxSignature(currentBbox) === getPaintedCellsBboxSignature(bbox)
        ? currentBbox
        : bbox,
    );
  }, []);

  const handlePaintCells = useCallback(
    (h3Ids: string[]) => {
      const newH3Ids = addVisiblePaintedH3Ids(h3Ids);

      for (const h3Id of newH3Ids) {
        if (!pendingEraseH3IdsRef.current.delete(h3Id)) {
          pendingPaintH3IdsRef.current.add(h3Id);
        }
      }
    },
    [addVisiblePaintedH3Ids],
  );

  const handleEraseCells = useCallback(
    (h3Ids: string[]) => {
      const erasedH3Ids = removeVisiblePaintedH3Ids(h3Ids);

      for (const h3Id of erasedH3Ids) {
        if (!pendingPaintH3IdsRef.current.delete(h3Id)) {
          pendingEraseH3IdsRef.current.add(h3Id);
        }
      }
    },
    [removeVisiblePaintedH3Ids],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapView
        className="absolute inset-0"
        viewState={mapViewState}
        brushMode={brushMode}
        brushRadiusMeters={DEFAULT_BRUSH_RADIUS_METERS}
        paintedH3Ids={paintedH3Ids}
        onViewStateChange={handleMapViewStateChange}
        onViewportBoundsChange={handlePaintedCellsViewportChange}
        onPaintCells={handlePaintCells}
        onEraseCells={handleEraseCells}
        onBrushStrokeEnd={flushPendingPaintMutations}
      />

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-background/72 p-2 shadow-2xl backdrop-blur">
        <Button
          variant={mapViewState.mode === "street" ? "default" : "secondary"}
          aria-pressed={mapViewState.mode === "street"}
          data-testid="street-map-mode"
          onClick={() => handleMapModeChange("street")}
        >
          <MapPinned className="h-4 w-4" />
          Map
        </Button>
        <Button
          variant={mapViewState.mode === "satellite" ? "default" : "secondary"}
          aria-pressed={mapViewState.mode === "satellite"}
          data-testid="satellite-map-mode"
          onClick={() => handleMapModeChange("satellite")}
        >
          <Satellite className="h-4 w-4" />
          Satellite
        </Button>
        <Button
          variant={brushMode === "paint" ? "default" : "secondary"}
          size="icon"
          aria-label="Brush"
          aria-pressed={brushMode === "paint"}
          title={`Brush: ${DEFAULT_BRUSH_RADIUS_METERS}m`}
          data-testid="paint-mode"
          onClick={() => {
            setBrushMode((currentMode) => (currentMode === "paint" ? null : "paint"));
          }}
        >
          <Brush className="h-4 w-4" />
        </Button>
        <Button
          variant={brushMode === "erase" ? "default" : "secondary"}
          size="icon"
          aria-label="Eraser"
          aria-pressed={brushMode === "erase"}
          title={`Eraser: ${DEFAULT_BRUSH_RADIUS_METERS}m`}
          data-testid="erase-mode"
          onClick={() => {
            setBrushMode((currentMode) => (currentMode === "erase" ? null : "erase"));
          }}
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-lg border border-border bg-background/72 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full bg-amber-400",
            health === "ok" && "bg-emerald-400",
            health === "error" && "bg-red-500",
          )}
        />
        <span>
          Backend:{" "}
          {health === "loading"
            ? "checking"
            : health === "ok"
              ? "available"
              : "unavailable"}
        </span>
        <span className="text-slate-500">/</span>
        <span>
          Map state:{" "}
          {mapPersistenceState === "loading"
            ? "loading"
            : mapPersistenceState === "saving"
              ? "saving"
              : mapPersistenceState === "saved"
                ? "saved"
                : "error"}
        </span>
        <span className="text-slate-500">/</span>
        <span>
          Paint:{" "}
          {paintPersistenceState === "idle"
            ? "ready"
            : paintPersistenceState === "loading"
              ? "loading"
              : paintPersistenceState === "saving"
                ? "saving"
                : paintPersistenceState === "saved"
                  ? "saved"
                  : paintPersistenceState === "limited"
                    ? "limited"
                    : "error"}
        </span>
      </div>
    </main>
  );
}
