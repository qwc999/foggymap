import { useCallback, useEffect, useRef, useState } from "react";

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
import { AppToolbar } from "@/components/toolbar/AppToolbar";
import type { MapMode } from "@/config/mapProviders";
import { cn } from "@/lib/utils";
import {
  chunkCellRefInputs,
  chunkPaintCellInputs,
  createCellRefInputs,
  createPaintCellInputs,
  mergePaintedH3Ids,
  removePaintedH3Ids,
  type BrushMode,
} from "@/paint/brush";
import { createHomeRadiusPaintH3Ids, HOME_RADIUS_METERS } from "@/paint/homeRadius";
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
type HomeRadiusPaintState = "idle" | "confirming" | "painting" | "saved" | "error";
type BackupState = "idle" | "exporting" | "importing" | "saved" | "error";
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
  const [brushRadiusMeters, setBrushRadiusMeters] = useState(() =>
    normalizeBrushRadiusMeters(null),
  );
  const [brushPersistenceState, setBrushPersistenceState] =
    useState<BrushPersistenceState>("loading");
  const [homeLocation, setHomeLocation] = useState<HomeLocationState | null>(null);
  const [homePickModeEnabled, setHomePickModeEnabled] = useState(false);
  const [homeRadiusPreviewEnabled, setHomeRadiusPreviewEnabled] = useState(false);
  const [homeRadiusPaintState, setHomeRadiusPaintState] =
    useState<HomeRadiusPaintState>("idle");
  const [homeRadiusPaintProgress, setHomeRadiusPaintProgress] = useState<{
    painted: number;
    total: number;
  } | null>(null);
  const [backupState, setBackupState] = useState<BackupState>("idle");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [homePersistenceState, setHomePersistenceState] =
    useState<HomePersistenceState>("loading");
  const [paintedH3Ids, setPaintedH3Ids] = useState<string[]>([]);
  const [paintedCellsViewportBbox, setPaintedCellsViewportBbox] =
    useState<PaintedCellsBbox | null>(null);
  const [paintPersistenceState, setPaintPersistenceState] =
    useState<PaintPersistenceState>("idle");
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

    if (
      hasPendingPaintChanges() ||
      paintPersistenceState === "saving" ||
      homeRadiusPaintState === "painting"
    ) {
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
    homeRadiusPaintState,
    mapPersistenceState,
    paintPersistenceState,
  ]);

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

  useEffect(() => {
    if (!homeLocation) {
      setHomeRadiusPreviewEnabled(false);
      setHomeRadiusPaintState((currentState) =>
        currentState === "painting" ? currentState : "idle",
      );
    }
  }, [homeLocation]);

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

  const mergeVisiblePaintedH3Ids = useCallback((h3Ids: readonly string[]) => {
    const mergedH3Ids = mergePaintedH3Ids([...paintedH3IdSetRef.current], h3Ids);

    if (mergedH3Ids.length !== paintedH3IdSetRef.current.size) {
      paintedH3IdSetRef.current = new Set(mergedH3Ids);
      setPaintedH3Ids(mergedH3Ids);
    }
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

  const handleToggleHomeRadiusPreview = useCallback(() => {
    if (!homeLocation) {
      return;
    }

    setHomeRadiusPreviewEnabled((currentValue) => !currentValue);
  }, [homeLocation]);

  const handleRequestHomeRadiusPaint = useCallback(() => {
    if (!homeLocation || homeRadiusPaintState === "painting") {
      return;
    }

    setHomeRadiusPaintProgress(null);
    setHomeRadiusPaintState("confirming");
  }, [homeLocation, homeRadiusPaintState]);

  const handleCancelHomeRadiusPaint = useCallback(() => {
    setHomeRadiusPaintState("idle");
    setHomeRadiusPaintProgress(null);
  }, []);

  const handleConfirmHomeRadiusPaint = useCallback(() => {
    if (!homeLocation || homeRadiusPaintState !== "confirming") {
      return;
    }

    const homeCenter = {
      lng: homeLocation.longitude,
      lat: homeLocation.latitude,
    };

    setHomeRadiusPaintState("painting");
    setPaintPersistenceState("saving");

    void (async () => {
      try {
        const h3Ids = createHomeRadiusPaintH3Ids(homeCenter, HOME_RADIUS_METERS);
        const cells = createPaintCellInputs(h3Ids);
        let painted = 0;

        setHomeRadiusPaintProgress({ painted, total: cells.length });
        setHomeRadiusPreviewEnabled(true);

        for (const h3Id of h3Ids) {
          pendingPaintH3IdsRef.current.delete(h3Id);
          pendingEraseH3IdsRef.current.delete(h3Id);
        }

        mergeVisiblePaintedH3Ids(h3Ids);
        await yieldToBrowser();

        for (const batch of chunkPaintCellInputs(cells)) {
          await paintCells(batch);
          painted += batch.length;
          setHomeRadiusPaintProgress({ painted, total: cells.length });
          await yieldToBrowser();
        }

        setPaintPersistenceState("saved");
        setHomeRadiusPaintState("saved");
      } catch {
        setPaintPersistenceState("error");
        setHomeRadiusPaintState("error");
      }
    })();
  }, [homeLocation, homeRadiusPaintState, mergeVisiblePaintedH3Ids]);

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
    lastPersistedMapStateSignatureRef.current =
      getMapViewStateSignature(nextMapViewState);
    lastPersistedBrushRadiusRef.current = nextBrushRadiusMeters;

    setMapViewState(nextMapViewState);
    setMapPersistenceState("saved");
    setBrushRadiusMeters(nextBrushRadiusMeters);
    setBrushPersistenceState("saved");
    setHomeLocation(nextHomeLocation);
    setHomePickModeEnabled(false);
    setHomeRadiusPreviewEnabled(false);
    setHomeRadiusPaintState("idle");
    setHomeRadiusPaintProgress(null);
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
  }, [paintedCellsViewportBbox, replaceVisiblePaintedH3Ids]);

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

  const backupBlockMessage = getBackupBlockMessage();
  const backupBusy =
    backupState === "exporting" ||
    backupState === "importing" ||
    Boolean(backupBlockMessage);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapView
        className="absolute inset-0"
        viewState={mapViewState}
        brushMode={brushMode}
        brushRadiusMeters={brushRadiusMeters}
        homeLocation={homeLocation}
        homePickModeEnabled={homePickModeEnabled}
        homeRadiusPreviewEnabled={homeRadiusPreviewEnabled}
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
        hasHomeLocation={Boolean(homeLocation)}
        homePickModeEnabled={homePickModeEnabled}
        homeRadiusPainting={homeRadiusPaintState === "painting"}
        homeRadiusPreviewEnabled={homeRadiusPreviewEnabled}
        mapMode={mapViewState.mode}
        onBrushModeChange={handleBrushModeChange}
        onBrushRadiusChange={handleBrushRadiusChange}
        onExportBackup={handleExportBackup}
        onGoHome={handleGoHome}
        onImportBackupFile={handleImportBackupFile}
        onMapModeChange={handleMapModeChange}
        onRequestHomeRadiusPaint={handleRequestHomeRadiusPaint}
        onSetHomeFromCenter={handleSetHomeFromCenter}
        onToggleHomeRadiusPreview={handleToggleHomeRadiusPreview}
        onToggleHomePickMode={handleToggleHomePickMode}
      />

      {homeRadiusPaintState === "confirming" && (
        <div
          className="absolute left-4 top-24 z-10 w-80 rounded-lg border border-white/10 bg-slate-950/85 p-3 text-sm text-slate-100 shadow-2xl backdrop-blur-xl"
          data-testid="home-radius-confirm"
        >
          <div className="font-medium">Paint 10km around home?</div>
          <div className="mt-1 text-xs text-slate-400">
            This can add about fifteen thousand H3 cells.
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/15"
              data-testid="home-radius-cancel"
              type="button"
              onClick={handleCancelHomeRadiusPaint}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
              data-testid="home-radius-confirm-paint"
              type="button"
              onClick={handleConfirmHomeRadiusPaint}
            >
              Paint
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-10 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background/72 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur">
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
          Brush:{" "}
          {brushPersistenceState === "loading"
            ? "loading"
            : brushPersistenceState === "saving"
              ? "saving"
              : brushPersistenceState === "saved"
                ? "saved"
                : "error"}
        </span>
        <span className="text-slate-500">/</span>
        <span>
          Home:{" "}
          {homePersistenceState === "loading"
            ? "loading"
            : homePersistenceState === "saving"
              ? "saving"
              : homePersistenceState === "saved"
                ? homeLocation
                  ? "saved"
                  : "not set"
                : "error"}
        </span>
        <span className="text-slate-500">/</span>
        <span>
          Radius:{" "}
          {homeRadiusPaintState === "painting" && homeRadiusPaintProgress
            ? `${homeRadiusPaintProgress.painted}/${homeRadiusPaintProgress.total}`
            : homeRadiusPaintState === "confirming"
              ? "confirm"
              : homeRadiusPaintState === "saved"
                ? "saved"
                : homeRadiusPaintState === "error"
                  ? "error"
                  : homeRadiusPreviewEnabled
                    ? "shown"
                    : "ready"}
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
        <span className="text-slate-500">/</span>
        <span>
          Backup:{" "}
          {backupState === "idle"
            ? backupBlockMessage
              ? "waiting"
              : "ready"
            : backupState === "exporting"
              ? "exporting"
              : backupState === "importing"
                ? "importing"
                : backupState === "saved"
                  ? (backupMessage ?? "saved")
                  : (backupMessage ?? "error")}
        </span>
      </div>
    </main>
  );
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

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
