import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { MapMode } from "@/config/mapProviders";
import { resolveProvider } from "@/config/mapProviders";
import {
  h3CellToGeoJsonFeature,
  lngLatToH3Cell,
  type H3CellFeatureCollection,
} from "@/geo/h3Helpers";
import { cn } from "@/lib/utils";
import { areMapViewStatesEqual, type MapViewState } from "@/state/mapViewState";

const H3_PREVIEW_SOURCE_ID = "h3-preview";
const H3_PREVIEW_FILL_LAYER_ID = "h3-preview-fill";
const H3_PREVIEW_LINE_LAYER_ID = "h3-preview-line";

const EMPTY_H3_PREVIEW_FEATURE_COLLECTION: H3CellFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

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

function ensureH3PreviewLayers(map: maplibregl.Map): boolean {
  try {
    if (!map.getStyle()) {
      return false;
    }

    if (!map.getSource(H3_PREVIEW_SOURCE_ID)) {
      map.addSource(H3_PREVIEW_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_H3_PREVIEW_FEATURE_COLLECTION,
      });
    }

    if (!map.getLayer(H3_PREVIEW_FILL_LAYER_ID)) {
      map.addLayer({
        id: H3_PREVIEW_FILL_LAYER_ID,
        type: "fill",
        source: H3_PREVIEW_SOURCE_ID,
        paint: {
          "fill-color": "#22d3ee",
          "fill-opacity": 0.36,
        },
      });
    }

    if (!map.getLayer(H3_PREVIEW_LINE_LAYER_ID)) {
      map.addLayer({
        id: H3_PREVIEW_LINE_LAYER_ID,
        type: "line",
        source: H3_PREVIEW_SOURCE_ID,
        paint: {
          "line-color": "#e0f2fe",
          "line-opacity": 0.95,
          "line-width": 2,
        },
      });
    }
  } catch {
    return false;
  }

  return true;
}

function setH3PreviewData(
  map: maplibregl.Map,
  featureCollection: H3CellFeatureCollection,
): boolean {
  if (!ensureH3PreviewLayers(map)) {
    return false;
  }

  const source = map.getSource(H3_PREVIEW_SOURCE_ID) as GeoJSONSource | undefined;

  if (source) {
    source.setData(featureCollection);
    return true;
  }

  return false;
}

function createH3PreviewFeatureCollection(h3Id: string): H3CellFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [h3CellToGeoJsonFeature(h3Id)],
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
  const currentPreviewH3CellRef = useRef<string | null>(null);

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

    const handleStyleData = () => {
      if (!ensureH3PreviewLayers(map)) {
        return;
      }

      if (currentPreviewH3CellRef.current) {
        setH3PreviewData(
          map,
          createH3PreviewFeatureCollection(currentPreviewH3CellRef.current),
        );
      }
    };

    const handleMoveEnd = () => {
      if (isApplyingExternalStateRef.current) {
        return;
      }

      onViewStateChangeRef.current?.(
        readMapViewStateFromMap(map, appliedModeRef.current),
      );
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const h3Id = lngLatToH3Cell({
        lng: wrapLongitude(event.lngLat.lng),
        lat: event.lngLat.lat,
      });

      if (
        currentPreviewH3CellRef.current === h3Id &&
        map.getSource(H3_PREVIEW_SOURCE_ID)
      ) {
        return;
      }

      if (setH3PreviewData(map, createH3PreviewFeatureCollection(h3Id))) {
        currentPreviewH3CellRef.current = h3Id;
      }
    };

    const clearPreview = () => {
      if (!currentPreviewH3CellRef.current) {
        return;
      }

      currentPreviewH3CellRef.current = null;
      setH3PreviewData(map, EMPTY_H3_PREVIEW_FEATURE_COLLECTION);
    };

    const canvas = map.getCanvas();

    map.on("load", handleStyleData);
    map.on("styledata", handleStyleData);
    map.on("moveend", handleMoveEnd);
    map.on("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", clearPreview);

    mapRef.current = map;

    return () => {
      map.off("load", handleStyleData);
      map.off("styledata", handleStyleData);
      map.off("moveend", handleMoveEnd);
      map.off("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", clearPreview);
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

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      data-testid="map-view"
    />
  );
}

function wrapLongitude(lng: number): number {
  if (!Number.isFinite(lng)) {
    return lng;
  }

  return ((((lng + 180) % 360) + 360) % 360) - 180;
}
