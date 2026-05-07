import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { PaintedCellsBbox } from "@/api/paintedCells";
import { DEFAULT_BRUSH_RADIUS_METERS } from "@/config/h3";
import type { MapMode } from "@/config/mapProviders";
import { resolveProvider } from "@/config/mapProviders";
import {
  getH3DiskForLngLat,
  h3CellToGeoJsonFeature,
  h3CellsToGeoJsonFeatureCollection,
  lngLatToH3Cell,
  type H3CellFeatureCollection,
} from "@/geo/h3Helpers";
import { cn } from "@/lib/utils";
import {
  collectExistingPaintedH3Ids,
  collectNewPaintedH3Ids,
  type BrushMode,
} from "@/paint/brush";
import { areMapViewStatesEqual, type MapViewState } from "@/state/mapViewState";

const H3_PREVIEW_SOURCE_ID = "h3-preview";
const H3_PREVIEW_FILL_LAYER_ID = "h3-preview-fill";
const H3_PREVIEW_LINE_LAYER_ID = "h3-preview-line";
const PAINTED_CELLS_SOURCE_ID = "painted-cells";
const PAINTED_CELLS_FILL_LAYER_ID = "painted-cells-fill";
const PAINTED_CELLS_LINE_LAYER_ID = "painted-cells-line";

const EMPTY_H3_PREVIEW_FEATURE_COLLECTION: H3CellFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_PAINTED_CELLS_FEATURE_COLLECTION: H3CellFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface MapViewProps {
  className?: string;
  viewState: MapViewState;
  brushMode?: BrushMode | null;
  brushRadiusMeters?: number;
  paintedH3Ids?: readonly string[];
  onViewStateChange?: (viewState: MapViewState) => void;
  onViewportBoundsChange?: (bbox: PaintedCellsBbox) => void;
  onPaintCells?: (h3Ids: string[]) => void;
  onEraseCells?: (h3Ids: string[]) => void;
  onBrushStrokeEnd?: () => void;
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

function applyH3PreviewStyle(map: maplibregl.Map, brushMode: BrushMode | null): void {
  if (!ensureH3PreviewLayers(map)) {
    return;
  }

  const isEraseMode = brushMode === "erase";

  map.setPaintProperty(
    H3_PREVIEW_FILL_LAYER_ID,
    "fill-color",
    isEraseMode ? "#f97316" : "#22d3ee",
  );
  map.setPaintProperty(
    H3_PREVIEW_FILL_LAYER_ID,
    "fill-opacity",
    isEraseMode ? 0.3 : 0.36,
  );
  map.setPaintProperty(
    H3_PREVIEW_LINE_LAYER_ID,
    "line-color",
    isEraseMode ? "#fed7aa" : "#e0f2fe",
  );
  map.setPaintProperty(
    H3_PREVIEW_LINE_LAYER_ID,
    "line-opacity",
    isEraseMode ? 1 : 0.95,
  );
  map.setPaintProperty(H3_PREVIEW_LINE_LAYER_ID, "line-width", isEraseMode ? 3 : 2);
}

function ensurePaintedCellsLayers(map: maplibregl.Map): boolean {
  try {
    if (!map.getStyle()) {
      return false;
    }

    if (!map.getSource(PAINTED_CELLS_SOURCE_ID)) {
      map.addSource(PAINTED_CELLS_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_PAINTED_CELLS_FEATURE_COLLECTION,
      });
    }

    if (!map.getLayer(PAINTED_CELLS_FILL_LAYER_ID)) {
      map.addLayer({
        id: PAINTED_CELLS_FILL_LAYER_ID,
        type: "fill",
        source: PAINTED_CELLS_SOURCE_ID,
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.36,
        },
      });
    }

    if (!map.getLayer(PAINTED_CELLS_LINE_LAYER_ID)) {
      map.addLayer({
        id: PAINTED_CELLS_LINE_LAYER_ID,
        type: "line",
        source: PAINTED_CELLS_SOURCE_ID,
        paint: {
          "line-color": "#93c5fd",
          "line-opacity": 0.42,
          "line-width": 1,
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

function setPaintedCellsData(
  map: maplibregl.Map,
  featureCollection: H3CellFeatureCollection,
): boolean {
  if (!ensurePaintedCellsLayers(map)) {
    return false;
  }

  const source = map.getSource(PAINTED_CELLS_SOURCE_ID) as GeoJSONSource | undefined;

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

function createPaintedCellsFeatureCollection(
  h3Ids: Iterable<string>,
): H3CellFeatureCollection {
  return h3CellsToGeoJsonFeatureCollection([...h3Ids]);
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

function readPaintedCellsBboxFromMap(map: maplibregl.Map): PaintedCellsBbox {
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const spansWorld = east - west >= 360;

  return {
    west: spansWorld ? -180 : wrapLongitude(west),
    south: clampLatitude(bounds.getSouth()),
    east: spansWorld ? 180 : wrapLongitude(east),
    north: clampLatitude(bounds.getNorth()),
  };
}

export function MapView({
  className,
  viewState,
  brushMode = null,
  brushRadiusMeters = DEFAULT_BRUSH_RADIUS_METERS,
  paintedH3Ids = [],
  onViewStateChange,
  onViewportBoundsChange,
  onPaintCells,
  onEraseCells,
  onBrushStrokeEnd,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialViewStateRef = useRef(viewState);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const onViewportBoundsChangeRef = useRef(onViewportBoundsChange);
  const onPaintCellsRef = useRef(onPaintCells);
  const onEraseCellsRef = useRef(onEraseCells);
  const onBrushStrokeEndRef = useRef(onBrushStrokeEnd);
  const appliedModeRef = useRef(viewState.mode);
  const isApplyingExternalStateRef = useRef(false);
  const currentPreviewH3CellRef = useRef<string | null>(null);
  const brushModeRef = useRef<BrushMode | null>(brushMode);
  const brushRadiusMetersRef = useRef(brushRadiusMeters);
  const paintedH3IdSetRef = useRef<Set<string>>(new Set(paintedH3Ids));
  const isPaintingRef = useRef(false);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    onViewportBoundsChangeRef.current = onViewportBoundsChange;
  }, [onViewportBoundsChange]);

  useEffect(() => {
    onPaintCellsRef.current = onPaintCells;
  }, [onPaintCells]);

  useEffect(() => {
    onEraseCellsRef.current = onEraseCells;
  }, [onEraseCells]);

  useEffect(() => {
    onBrushStrokeEndRef.current = onBrushStrokeEnd;
  }, [onBrushStrokeEnd]);

  useEffect(() => {
    brushRadiusMetersRef.current = brushRadiusMeters;
  }, [brushRadiusMeters]);

  useEffect(() => {
    paintedH3IdSetRef.current = new Set(paintedH3Ids);

    const map = mapRef.current;

    if (map) {
      setPaintedCellsData(
        map,
        createPaintedCellsFeatureCollection(paintedH3IdSetRef.current),
      );
    }
  }, [paintedH3Ids]);

  useEffect(() => {
    brushModeRef.current = brushMode;

    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.getCanvas().style.cursor = getBrushCursor(brushMode);
    applyH3PreviewStyle(map, brushMode);

    if (!brushMode && isPaintingRef.current) {
      isPaintingRef.current = false;
      map.dragPan.enable();
      onBrushStrokeEndRef.current?.();
    }
  }, [brushMode]);

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

    const syncPaintedCellsData = () => {
      setPaintedCellsData(
        map,
        createPaintedCellsFeatureCollection(paintedH3IdSetRef.current),
      );
    };

    const handleStyleData = () => {
      syncPaintedCellsData();
      applyH3PreviewStyle(map, brushModeRef.current);

      if (currentPreviewH3CellRef.current) {
        setH3PreviewData(
          map,
          createH3PreviewFeatureCollection(currentPreviewH3CellRef.current),
        );
      }
    };

    const reportViewportBounds = () => {
      onViewportBoundsChangeRef.current?.(readPaintedCellsBboxFromMap(map));
    };

    const handleMapLoad = () => {
      handleStyleData();
      reportViewportBounds();
    };

    const handleMoveEnd = () => {
      reportViewportBounds();

      if (isApplyingExternalStateRef.current) {
        return;
      }

      onViewStateChangeRef.current?.(
        readMapViewStateFromMap(map, appliedModeRef.current),
      );
    };

    const applyBrushAtLngLat = (lngLat: maplibregl.LngLat) => {
      const activeBrushMode = brushModeRef.current;

      if (!activeBrushMode) {
        return;
      }

      const brushH3Ids = getH3DiskForLngLat(
        {
          lng: wrapLongitude(lngLat.lng),
          lat: lngLat.lat,
        },
        brushRadiusMetersRef.current,
      );

      if (activeBrushMode === "paint") {
        const newH3Ids = collectNewPaintedH3Ids(paintedH3IdSetRef.current, brushH3Ids);

        if (newH3Ids.length === 0) {
          return;
        }

        for (const h3Id of newH3Ids) {
          paintedH3IdSetRef.current.add(h3Id);
        }

        syncPaintedCellsData();
        onPaintCellsRef.current?.(newH3Ids);
        return;
      }

      const erasedH3Ids = collectExistingPaintedH3Ids(
        paintedH3IdSetRef.current,
        brushH3Ids,
      );

      if (erasedH3Ids.length === 0) {
        return;
      }

      for (const h3Id of erasedH3Ids) {
        paintedH3IdSetRef.current.delete(h3Id);
      }

      syncPaintedCellsData();
      onEraseCellsRef.current?.(erasedH3Ids);
    };

    const stopBrushStroke = () => {
      if (!isPaintingRef.current) {
        return;
      }

      isPaintingRef.current = false;
      map.dragPan.enable();
      onBrushStrokeEndRef.current?.();
    };

    const handleMouseDown = (event: maplibregl.MapMouseEvent) => {
      if (!brushModeRef.current || event.originalEvent.button !== 0) {
        return;
      }

      event.preventDefault();
      event.originalEvent.preventDefault();
      isPaintingRef.current = true;
      map.dragPan.disable();
      applyBrushAtLngLat(event.lngLat);
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

      if (isPaintingRef.current) {
        event.preventDefault();
        applyBrushAtLngLat(event.lngLat);
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

    canvas.style.cursor = getBrushCursor(brushModeRef.current);
    applyH3PreviewStyle(map, brushModeRef.current);

    map.on("load", handleMapLoad);
    map.on("styledata", handleStyleData);
    map.on("moveend", handleMoveEnd);
    map.on("mousedown", handleMouseDown);
    map.on("mousemove", handleMouseMove);
    map.on("mouseup", stopBrushStroke);
    canvas.addEventListener("mouseleave", clearPreview);
    window.addEventListener("mouseup", stopBrushStroke);

    mapRef.current = map;

    return () => {
      stopBrushStroke();
      map.off("load", handleMapLoad);
      map.off("styledata", handleStyleData);
      map.off("moveend", handleMoveEnd);
      map.off("mousedown", handleMouseDown);
      map.off("mousemove", handleMouseMove);
      map.off("mouseup", stopBrushStroke);
      canvas.removeEventListener("mouseleave", clearPreview);
      window.removeEventListener("mouseup", stopBrushStroke);
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
      onViewportBoundsChangeRef.current?.(readPaintedCellsBboxFromMap(map));
    }, 0);
  }, [viewState]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      data-painted-cell-count={paintedH3Ids.length}
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

function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) {
    return lat;
  }

  return Math.max(-90, Math.min(90, lat));
}

function getBrushCursor(brushMode: BrushMode | null): string {
  if (brushMode === "paint") {
    return "crosshair";
  }

  if (brushMode === "erase") {
    return "not-allowed";
  }

  return "";
}
