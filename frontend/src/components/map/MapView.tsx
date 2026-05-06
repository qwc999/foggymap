import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { MapMode } from "@/config/mapProviders";
import { resolveProvider } from "@/config/mapProviders";
import { cn } from "@/lib/utils";
import { areMapViewStatesEqual, type MapViewState } from "@/state/mapViewState";

interface MapViewProps {
  className?: string;
  viewState: MapViewState;
  onViewStateChange?: (viewState: MapViewState) => void;
}

function createRasterStyle(mode: MapMode): StyleSpecification {
  const provider = resolveProvider(mode);

  if (provider.tileUrlTemplates.length === 0) {
    throw new Error(`Map provider "${provider.id}" has no tile templates`);
  }

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [...provider.tileUrlTemplates],
        tileSize: 256,
        minzoom: provider.minZoom,
        maxzoom: provider.maxZoom,
        attribution: provider.attribution,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function readMapViewStateFromMap(map: maplibregl.Map, mode: MapMode): MapViewState {
  const center = map.getCenter();

  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    mode,
  };
}

export function MapView({ className, viewState, onViewStateChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialViewStateRef = useRef(viewState);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const appliedModeRef = useRef(viewState.mode);
  const isApplyingExternalStateRef = useRef(false);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const initialViewState = initialViewStateRef.current;
    appliedModeRef.current = initialViewState.mode;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createRasterStyle(initialViewState.mode),
      center: initialViewState.center,
      zoom: initialViewState.zoom,
      bearing: initialViewState.bearing,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const handleMoveEnd = () => {
      if (isApplyingExternalStateRef.current) {
        return;
      }

      onViewStateChangeRef.current?.(
        readMapViewStateFromMap(map, appliedModeRef.current),
      );
    };

    map.on("moveend", handleMoveEnd);

    mapRef.current = map;

    return () => {
      map.off("moveend", handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const currentViewState = readMapViewStateFromMap(map, appliedModeRef.current);
    const needsCameraUpdate = !areMapViewStatesEqual(
      {
        ...currentViewState,
        mode: viewState.mode,
      },
      viewState,
    );
    const needsStyleUpdate = appliedModeRef.current !== viewState.mode;

    if (!needsCameraUpdate && !needsStyleUpdate) {
      return;
    }

    isApplyingExternalStateRef.current = true;

    if (needsStyleUpdate) {
      map.setStyle(createRasterStyle(viewState.mode));
      appliedModeRef.current = viewState.mode;
    }

    if (needsCameraUpdate) {
      map.jumpTo({
        center: viewState.center,
        zoom: viewState.zoom,
        bearing: viewState.bearing,
      });
    }

    window.setTimeout(() => {
      isApplyingExternalStateRef.current = false;
    }, 0);
  }, [viewState]);

  return <div ref={containerRef} className={cn("h-full w-full", className)} />;
}
