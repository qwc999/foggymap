import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, MapPinned, Satellite } from "lucide-react";

import { loadAppState, saveAppState, type JsonValue } from "@/api/appState";
import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import type { MapMode } from "@/config/mapProviders";
import { cn } from "@/lib/utils";
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

export function App() {
  const [health, setHealth] = useState<HealthState>("loading");
  const [mapViewState, setMapViewState] =
    useState<MapViewState>(DEFAULT_MAP_VIEW_STATE);
  const [mapPersistenceState, setMapPersistenceState] =
    useState<MapPersistenceState>("loading");
  const lastPersistedMapStateSignatureRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);

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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapView
        className="absolute inset-0"
        viewState={mapViewState}
        onViewStateChange={handleMapViewStateChange}
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
        <Button variant="secondary" size="icon" aria-label="Brush" disabled>
          <Brush className="h-4 w-4" />
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
      </div>
    </main>
  );
}
