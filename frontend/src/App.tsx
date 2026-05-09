import { useCallback, useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

import { exportBackup, importBackupOverwrite, type BackupDocument } from "@/api/backup";
import { loadAppState, saveAppState, type JsonValue } from "@/api/appState";
import {
  eraseCells,
  loadPaintedCellsInBbox,
  paintCells,
  type PaintedCellsBbox,
} from "@/api/paintedCells";
import { loadHomeLocation, saveHomeLocation } from "@/api/homeLocation";
import { MapView } from "@/components/map/MapView";
import { AppStatusView, type StatusItem } from "@/components/status/AppStatusView";
import { AppToolbar } from "@/components/toolbar/AppToolbar";
import { Button } from "@/components/ui/button";
import type { MapMode } from "@/config/mapProviders";
import {
  chunkCellRefInputs,
  chunkPaintCellInputs,
  createCellRefInputs,
  createPaintCellInputs,
  removePaintedH3Ids,
  type BrushMode,
} from "@/paint/brush";
import {
  clearPaintUndoHistory,
  createPaintUndoHistory,
  createUndoMutation,
  finalizePaintUndoAction,
  getPaintUndoStackSize,
  popPaintUndoAction,
  recordPaintUndoCells,
} from "@/paint/undo";
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
import {
  BRUSH_RADIUS_STATE_KEY,
  normalizeBrushRadiusMeters,
  sanitizeBrushRadiusMeters,
  serializeBrushRadiusMeters,
} from "@/state/brushSettings";
import {
  createHomeLocationInputFromLngLat,
  createHomeLocationInputFromMapViewState,
  createMapViewStateForHomeLocation,
  normalizeHomeLocation,
  type HomeLocationState,
} from "@/state/homeLocation";

type HealthState = "loading" | "ok" | "error";
type MapPersistenceState = "loading" | "saved" | "saving" | "error";
type BrushPersistenceState = "loading" | "saved" | "saving" | "error";
type HomePersistenceState = "loading" | "saved" | "saving" | "error";
type BackupState = "idle" | "exporting" | "importing" | "saved" | "error";
type ActiveView = "map" | "status";
type PaintPersistenceState =
  | "idle"
  | "loading"
  | "saved"
  | "saving"
  | "limited"
  | "error";

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [health, setHealth] = useState<HealthState>("loading");
  const [mapViewState, setMapViewState] =
    useState<MapViewState>(DEFAULT_MAP_VIEW_STATE);
  const [mapPersistenceState, setMapPersistenceState] =
    useState<MapPersistenceState>("loading");
  const [brushMode, setBrushMode] = useState<BrushMode | null>(null);
  const [brushRadiusMeters, setBrushRadiusMeters] = useState(() =>
    normalizeBrushRadiusMeters(null),
  );
  const [brushPersistenceState, setBrushPersistenceState] =
    useState<BrushPersistenceState>("loading");
  const [homeLocation, setHomeLocation] = useState<HomeLocationState | null>(null);
  const [homePickModeEnabled, setHomePickModeEnabled] = useState(false);
  const [backupState, setBackupState] = useState<BackupState>("idle");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [homePersistenceState, setHomePersistenceState] =
    useState<HomePersistenceState>("loading");
  const [paintedH3Ids, setPaintedH3Ids] = useState<string[]>([]);
  const [paintedCellsViewportBbox, setPaintedCellsViewportBbox] =
    useState<PaintedCellsBbox | null>(null);
  const [paintPersistenceState, setPaintPersistenceState] =
    useState<PaintPersistenceState>("idle");
  const [undoStackSize, setUndoStackSize] = useState(0);
  const lastPersistedMapStateSignatureRef = useRef<string | null>(null);
  const lastPersistedBrushRadiusRef = useRef<number | null>(null);
  const saveSequenceRef = useRef(0);
  const brushSaveSequenceRef = useRef(0);
  const homeSaveSequenceRef = useRef(0);
  const paintedH3IdSetRef = useRef<Set<string>>(new Set());
  const pendingPaintH3IdsRef = useRef<Set<string>>(new Set());
  const pendingEraseH3IdsRef = useRef<Set<string>>(new Set());
  const isSavingPaintMutationsRef = useRef(false);
  const viewportLoadSequenceRef = useRef(0);
  const undoHistoryRef = useRef(createPaintUndoHistory());

  const hasPendingPaintChanges = useCallback(
    () =>
      isSavingPaintMutationsRef.current ||
      pendingPaintH3IdsRef.current.size > 0 ||
      pendingEraseH3IdsRef.current.size > 0,
    [],
  );
  const getBackupBlockMessage = useCallback(() => {
    if (
      mapPersistenceState === "loading" ||
      brushPersistenceState === "loading" ||
      homePersistenceState === "loading"
    ) {
      return "Wait until app state is loaded.";
    }

    if (hasPendingPaintChanges() || paintPersistenceState === "saving") {
      return "Wait until paint changes are saved.";
    }

    if (
      mapPersistenceState === "saving" ||
      brushPersistenceState === "saving" ||
      homePersistenceState === "saving"
    ) {
      return "Wait until current settings are saved.";
    }

    return null;
  }, [
    brushPersistenceState,
    hasPendingPaintChanges,
    homePersistenceState,
    mapPersistenceState,
    paintPersistenceState,
  ]);

  const finalizeCurrentUndoAction = useCallback(() => {
    setUndoStackSize(finalizePaintUndoAction(undoHistoryRef.current));
  }, []);

  const recordPaintUndoAction = useCallback(
    (mode: BrushMode, h3Ids: readonly string[]) => {
      setUndoStackSize(recordPaintUndoCells(undoHistoryRef.current, mode, h3Ids));
    },
    [],
  );

  const clearUndoHistory = useCallback(() => {
    clearPaintUndoHistory(undoHistoryRef.current);
    setUndoStackSize(0);
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    loadAppState<JsonValue>(BRUSH_RADIUS_STATE_KEY)
      .then((storedValue) => {
        if (cancelled) {
          return;
        }

        const nextBrushRadiusMeters = normalizeBrushRadiusMeters(storedValue);

        lastPersistedBrushRadiusRef.current = nextBrushRadiusMeters;
        setBrushRadiusMeters(nextBrushRadiusMeters);
        setBrushPersistenceState("saved");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        lastPersistedBrushRadiusRef.current = normalizeBrushRadiusMeters(null);
        setBrushPersistenceState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (brushPersistenceState === "loading") {
      return;
    }

    const normalizedBrushRadiusMeters = sanitizeBrushRadiusMeters(brushRadiusMeters);

    if (normalizedBrushRadiusMeters !== brushRadiusMeters) {
      setBrushRadiusMeters(normalizedBrushRadiusMeters);
      return;
    }

    if (normalizedBrushRadiusMeters === lastPersistedBrushRadiusRef.current) {
      return;
    }

    const saveSequence = brushSaveSequenceRef.current + 1;
    brushSaveSequenceRef.current = saveSequence;
    setBrushPersistenceState("saving");

    const timeoutId = window.setTimeout(() => {
      saveAppState(
        BRUSH_RADIUS_STATE_KEY,
        serializeBrushRadiusMeters(normalizedBrushRadiusMeters),
      )
        .then(() => {
          if (brushSaveSequenceRef.current !== saveSequence) {
            return;
          }

          lastPersistedBrushRadiusRef.current = normalizedBrushRadiusMeters;
          setBrushPersistenceState("saved");
        })
        .catch(() => {
          if (brushSaveSequenceRef.current !== saveSequence) {
            return;
          }

          setBrushPersistenceState("error");
        });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [brushPersistenceState, brushRadiusMeters]);

  useEffect(() => {
    let cancelled = false;

    loadHomeLocation()
      .then((storedHomeLocation) => {
        if (cancelled) {
          return;
        }

        setHomeLocation(normalizeHomeLocation(storedHomeLocation));
        setHomePersistenceState("saved");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setHomePersistenceState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    finalizeCurrentUndoAction();

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
  }, [finalizeCurrentUndoAction]);

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

  const handleBrushModeChange = useCallback((mode: BrushMode | null) => {
    setBrushMode(mode);

    if (mode) {
      setHomePickModeEnabled(false);
    }
  }, []);

  const handleBrushRadiusChange = useCallback((radiusMeters: number) => {
    setBrushRadiusMeters(sanitizeBrushRadiusMeters(radiusMeters));
  }, []);

  const persistHomeLocation = useCallback(
    (homeLocationInput: Parameters<typeof saveHomeLocation>[0]) => {
      const saveSequence = homeSaveSequenceRef.current + 1;
      homeSaveSequenceRef.current = saveSequence;
      setHomePersistenceState("saving");

      void saveHomeLocation(homeLocationInput)
        .then((savedHomeLocation) => {
          if (homeSaveSequenceRef.current !== saveSequence) {
            return;
          }

          setHomeLocation(normalizeHomeLocation(savedHomeLocation));
          setHomePickModeEnabled(false);
          setHomePersistenceState("saved");
        })
        .catch(() => {
          if (homeSaveSequenceRef.current !== saveSequence) {
            return;
          }

          setHomePersistenceState("error");
        });
    },
    [],
  );

  const handleSetHomeFromCenter = useCallback(() => {
    persistHomeLocation(createHomeLocationInputFromMapViewState(mapViewState));
  }, [mapViewState, persistHomeLocation]);

  const handlePickHomeLocation = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      persistHomeLocation(createHomeLocationInputFromLngLat(lngLat, mapViewState.zoom));
    },
    [mapViewState.zoom, persistHomeLocation],
  );

  const handleGoHome = useCallback(() => {
    if (!homeLocation) {
      return;
    }

    setHomePickModeEnabled(false);
    setMapViewState((currentMapViewState) =>
      createMapViewStateForHomeLocation(currentMapViewState, homeLocation),
    );
  }, [homeLocation]);

  const handleToggleHomePickMode = useCallback(() => {
    setBrushMode(null);
    setHomePickModeEnabled((currentValue) => !currentValue);
  }, []);

  const reloadUserStateAfterBackupImport = useCallback(async () => {
    const [storedMapViewState, storedBrushRadius, storedHomeLocation, visibleCells] =
      await Promise.all([
        loadAppState<JsonValue>(MAP_VIEW_STATE_KEY),
        loadAppState<JsonValue>(BRUSH_RADIUS_STATE_KEY),
        loadHomeLocation(),
        paintedCellsViewportBbox
          ? loadPaintedCellsInBbox({
              ...paintedCellsViewportBbox,
              limit: PAINTED_CELLS_VIEWPORT_QUERY_LIMIT,
            })
          : Promise.resolve(null),
      ]);

    const nextMapViewState = normalizeMapViewState(storedMapViewState);
    const nextBrushRadiusMeters = normalizeBrushRadiusMeters(storedBrushRadius);
    const nextHomeLocation = normalizeHomeLocation(storedHomeLocation);

    pendingPaintH3IdsRef.current.clear();
    pendingEraseH3IdsRef.current.clear();
    clearUndoHistory();
    lastPersistedMapStateSignatureRef.current =
      getMapViewStateSignature(nextMapViewState);
    lastPersistedBrushRadiusRef.current = nextBrushRadiusMeters;

    setMapViewState(nextMapViewState);
    setMapPersistenceState("saved");
    setBrushRadiusMeters(nextBrushRadiusMeters);
    setBrushPersistenceState("saved");
    setHomeLocation(nextHomeLocation);
    setHomePickModeEnabled(false);
    setHomePersistenceState("saved");

    if (visibleCells) {
      replaceVisiblePaintedH3Ids(
        createViewportPaintedH3Ids(
          visibleCells.cells.map((cell) => cell.h3_id),
          pendingPaintH3IdsRef.current,
          pendingEraseH3IdsRef.current,
        ),
      );
      setPaintPersistenceState(visibleCells.truncated ? "limited" : "saved");
    } else {
      replaceVisiblePaintedH3Ids([]);
      setPaintPersistenceState("idle");
    }
  }, [clearUndoHistory, paintedCellsViewportBbox, replaceVisiblePaintedH3Ids]);

  const handleExportBackup = useCallback(() => {
    const backupBlockMessage = getBackupBlockMessage();

    if (backupBlockMessage) {
      setBackupState("error");
      setBackupMessage(backupBlockMessage);
      return;
    }

    setBackupState("exporting");
    setBackupMessage(null);

    void exportBackup()
      .then((backup) => {
        downloadBackupDocument(backup);
        setBackupState("saved");
        setBackupMessage("Exported");
      })
      .catch((error: unknown) => {
        setBackupState("error");
        setBackupMessage(error instanceof Error ? error.message : "Export failed.");
      });
  }, [getBackupBlockMessage]);

  const handleImportBackupFile = useCallback(
    (file: File) => {
      const backupBlockMessage = getBackupBlockMessage();

      if (backupBlockMessage) {
        setBackupState("error");
        setBackupMessage(backupBlockMessage);
        return;
      }

      setBackupState("importing");
      setBackupMessage(null);

      void (async () => {
        try {
          const backup = JSON.parse(await file.text()) as BackupDocument;
          const shouldOverwrite = window.confirm(
            "Import backup and overwrite current map data?",
          );

          if (!shouldOverwrite) {
            setBackupState("idle");
            return;
          }

          await importBackupOverwrite(backup);
          await reloadUserStateAfterBackupImport();
          setBackupState("saved");
          setBackupMessage("Imported");
        } catch (error) {
          setBackupState("error");
          setBackupMessage(error instanceof Error ? error.message : "Import failed.");
        }
      })();
    },
    [getBackupBlockMessage, reloadUserStateAfterBackupImport],
  );

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

      recordPaintUndoAction("paint", newH3Ids);
    },
    [addVisiblePaintedH3Ids, recordPaintUndoAction],
  );

  const handleEraseCells = useCallback(
    (h3Ids: string[]) => {
      const erasedH3Ids = removeVisiblePaintedH3Ids(h3Ids);

      for (const h3Id of erasedH3Ids) {
        if (!pendingPaintH3IdsRef.current.delete(h3Id)) {
          pendingEraseH3IdsRef.current.add(h3Id);
        }
      }

      recordPaintUndoAction("erase", erasedH3Ids);
    },
    [recordPaintUndoAction, removeVisiblePaintedH3Ids],
  );

  const handleUndo = useCallback(() => {
    const action = popPaintUndoAction(undoHistoryRef.current);
    setUndoStackSize(getPaintUndoStackSize(undoHistoryRef.current));

    if (!action) {
      return;
    }

    const { paintH3Ids, eraseH3Ids } = createUndoMutation(action);

    if (eraseH3Ids.length > 0) {
      removeVisiblePaintedH3Ids(eraseH3Ids);

      for (const h3Id of eraseH3Ids) {
        if (!pendingPaintH3IdsRef.current.delete(h3Id)) {
          pendingEraseH3IdsRef.current.add(h3Id);
        }
      }
    }

    if (paintH3Ids.length > 0) {
      addVisiblePaintedH3Ids(paintH3Ids);

      for (const h3Id of paintH3Ids) {
        if (!pendingEraseH3IdsRef.current.delete(h3Id)) {
          pendingPaintH3IdsRef.current.add(h3Id);
        }
      }
    }

    flushPendingPaintMutations();
  }, [addVisiblePaintedH3Ids, flushPendingPaintMutations, removeVisiblePaintedH3Ids]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey ||
        event.key.toLowerCase() !== "z" ||
        isEditableElement(event.target)
      ) {
        return;
      }

      event.preventDefault();
      handleUndo();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUndo]);

  const backupBlockMessage = getBackupBlockMessage();
  const backupBusy =
    backupState === "exporting" ||
    backupState === "importing" ||
    Boolean(backupBlockMessage);
  const statusItems = createStatusItems({
    health,
    mapPersistenceState,
    brushPersistenceState,
    homePersistenceState,
    homeLocation,
    paintPersistenceState,
    backupState,
    backupMessage,
    backupBlockMessage,
  });

  if (activeView === "status") {
    return (
      <AppStatusView items={statusItems} onBackToMap={() => setActiveView("map")} />
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapView
        className="absolute inset-0"
        viewState={mapViewState}
        brushMode={brushMode}
        brushRadiusMeters={brushRadiusMeters}
        homeLocation={homeLocation}
        homePickModeEnabled={homePickModeEnabled}
        paintedH3Ids={paintedH3Ids}
        onViewStateChange={handleMapViewStateChange}
        onViewportBoundsChange={handlePaintedCellsViewportChange}
        onPaintCells={handlePaintCells}
        onEraseCells={handleEraseCells}
        onBrushStrokeEnd={flushPendingPaintMutations}
        onPickHomeLocation={handlePickHomeLocation}
      />

      <AppToolbar
        brushMode={brushMode}
        brushRadiusMeters={brushRadiusMeters}
        backupBusy={backupBusy}
        canUndo={undoStackSize > 0}
        hasHomeLocation={Boolean(homeLocation)}
        homePickModeEnabled={homePickModeEnabled}
        mapMode={mapViewState.mode}
        onBrushModeChange={handleBrushModeChange}
        onBrushRadiusChange={handleBrushRadiusChange}
        onExportBackup={handleExportBackup}
        onGoHome={handleGoHome}
        onImportBackupFile={handleImportBackupFile}
        onMapModeChange={handleMapModeChange}
        onSetHomeFromCenter={handleSetHomeFromCenter}
        onToggleHomePickMode={handleToggleHomePickMode}
        onUndo={handleUndo}
      />

      <Button
        aria-label="Open status"
        className="absolute right-4 top-4 z-10 h-10 w-10 rounded-md border-white/15 bg-slate-950/75 p-0 text-slate-100 shadow-2xl backdrop-blur-xl transition hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300"
        data-testid="open-status-view"
        size="icon"
        title="Status"
        type="button"
        variant="secondary"
        onClick={() => setActiveView("status")}
      >
        <Activity className="h-5 w-5 stroke-[2.4]" />
      </Button>
    </main>
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function createStatusItems({
  health,
  mapPersistenceState,
  brushPersistenceState,
  homePersistenceState,
  homeLocation,
  paintPersistenceState,
  backupState,
  backupMessage,
  backupBlockMessage,
}: {
  health: HealthState;
  mapPersistenceState: MapPersistenceState;
  brushPersistenceState: BrushPersistenceState;
  homePersistenceState: HomePersistenceState;
  homeLocation: HomeLocationState | null;
  paintPersistenceState: PaintPersistenceState;
  backupState: BackupState;
  backupMessage: string | null;
  backupBlockMessage: string | null;
}): StatusItem[] {
  return [
    {
      label: "Backend",
      value:
        health === "loading"
          ? "checking"
          : health === "ok"
            ? "available"
            : "unavailable",
      tone: health === "ok" ? "ok" : health === "loading" ? "pending" : "error",
    },
    {
      label: "Map state",
      value: persistenceStateLabel(mapPersistenceState),
      tone: persistenceStateTone(mapPersistenceState),
    },
    {
      label: "Brush",
      value: persistenceStateLabel(brushPersistenceState),
      tone: persistenceStateTone(brushPersistenceState),
    },
    {
      label: "Home",
      value:
        homePersistenceState === "saved" && !homeLocation
          ? "not set"
          : persistenceStateLabel(homePersistenceState),
      tone:
        homePersistenceState === "saved" && !homeLocation
          ? "info"
          : persistenceStateTone(homePersistenceState),
    },
    {
      label: "Paint",
      value:
        paintPersistenceState === "idle"
          ? "ready"
          : persistenceStateLabel(paintPersistenceState),
      tone:
        paintPersistenceState === "idle"
          ? "ok"
          : persistenceStateTone(paintPersistenceState),
    },
    {
      label: "Backup",
      value:
        backupState === "idle"
          ? backupBlockMessage
            ? `waiting: ${backupBlockMessage}`
            : "ready"
          : backupState === "saved"
            ? (backupMessage ?? "saved")
            : backupState === "error"
              ? (backupMessage ?? "error")
              : backupState,
      tone:
        backupState === "error"
          ? "error"
          : backupState === "exporting" ||
              backupState === "importing" ||
              backupBlockMessage
            ? "pending"
            : "ok",
    },
  ];
}

function persistenceStateLabel(
  state:
    | MapPersistenceState
    | BrushPersistenceState
    | HomePersistenceState
    | PaintPersistenceState,
) {
  return state === "idle" ? "ready" : state;
}

function persistenceStateTone(
  state:
    | MapPersistenceState
    | BrushPersistenceState
    | HomePersistenceState
    | PaintPersistenceState,
): StatusItem["tone"] {
  if (state === "error") {
    return "error";
  }

  if (state === "loading" || state === "saving") {
    return "pending";
  }

  return "ok";
}

function downloadBackupDocument(backup: BackupDocument): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = `foggy-map-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
