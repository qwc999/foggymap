import { useRef, type ChangeEvent } from "react";
import {
  Brush,
  CircleDashed,
  Download,
  Eraser,
  Home,
  MapPinPlus,
  MapPinned,
  MousePointerClick,
  PaintBucket,
  Ruler,
  Satellite,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MAX_BRUSH_RADIUS_METERS, MIN_BRUSH_RADIUS_METERS } from "@/config/h3";
import type { MapMode } from "@/config/mapProviders";
import { cn } from "@/lib/utils";
import type { BrushMode } from "@/paint/brush";
import { BRUSH_RADIUS_STEP_METERS } from "@/state/brushSettings";

interface AppToolbarProps {
  mapMode: MapMode;
  brushMode: BrushMode | null;
  brushRadiusMeters: number;
  hasHomeLocation: boolean;
  homePickModeEnabled: boolean;
  homeRadiusPreviewEnabled: boolean;
  homeRadiusPainting: boolean;
  backupBusy: boolean;
  onMapModeChange: (mode: MapMode) => void;
  onBrushModeChange: (mode: BrushMode | null) => void;
  onBrushRadiusChange: (radiusMeters: number) => void;
  onGoHome: () => void;
  onSetHomeFromCenter: () => void;
  onToggleHomePickMode: () => void;
  onToggleHomeRadiusPreview: () => void;
  onRequestHomeRadiusPaint: () => void;
  onExportBackup: () => void;
  onImportBackupFile: (file: File) => void;
}

const iconButtonClassName = "h-9 w-9 rounded-md";
const groupClassName =
  "flex items-center gap-1 rounded-md border border-white/10 bg-slate-950/55 p-1";

export function AppToolbar({
  mapMode,
  brushMode,
  brushRadiusMeters,
  hasHomeLocation,
  homePickModeEnabled,
  homeRadiusPreviewEnabled,
  homeRadiusPainting,
  backupBusy,
  onMapModeChange,
  onBrushModeChange,
  onBrushRadiusChange,
  onGoHome,
  onSetHomeFromCenter,
  onToggleHomePickMode,
  onToggleHomeRadiusPreview,
  onRequestHomeRadiusPaint,
  onExportBackup,
  onImportBackupFile,
}: AppToolbarProps) {
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleBrushRadiusChange = (event: ChangeEvent<HTMLInputElement>) => {
    onBrushRadiusChange(Number(event.currentTarget.value));
  };

  const handleBackupFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = "";

    if (file) {
      onImportBackupFile(file);
    }
  };

  return (
    <div
      className="absolute left-4 top-4 z-10 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-950/75 p-2 text-slate-100 shadow-2xl backdrop-blur-xl"
      data-testid="app-toolbar"
    >
      <div aria-label="Map mode" className={groupClassName} role="group">
        <Button
          aria-label="Map"
          aria-pressed={mapMode === "street"}
          className={iconButtonClassName}
          data-testid="street-map-mode"
          size="icon"
          title="Map"
          variant={mapMode === "street" ? "default" : "secondary"}
          onClick={() => onMapModeChange("street")}
        >
          <MapPinned className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Satellite"
          aria-pressed={mapMode === "satellite"}
          className={iconButtonClassName}
          data-testid="satellite-map-mode"
          size="icon"
          title="Satellite"
          variant={mapMode === "satellite" ? "default" : "secondary"}
          onClick={() => onMapModeChange("satellite")}
        >
          <Satellite className="h-4 w-4" />
        </Button>
      </div>

      <div aria-label="Paint tools" className={groupClassName} role="group">
        <Button
          aria-label="Brush"
          aria-pressed={brushMode === "paint"}
          className={iconButtonClassName}
          data-testid="paint-mode"
          size="icon"
          title={`Brush ${brushRadiusMeters}m`}
          variant={brushMode === "paint" ? "default" : "secondary"}
          onClick={() => onBrushModeChange(brushMode === "paint" ? null : "paint")}
        >
          <Brush className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Eraser"
          aria-pressed={brushMode === "erase"}
          className={iconButtonClassName}
          data-testid="erase-mode"
          size="icon"
          title={`Eraser ${brushRadiusMeters}m`}
          variant={brushMode === "erase" ? "default" : "secondary"}
          onClick={() => onBrushModeChange(brushMode === "erase" ? null : "erase")}
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      <div aria-label="Home tools" className={groupClassName} role="group">
        <Button
          aria-label="Go home"
          className={cn(iconButtonClassName, !hasHomeLocation && "opacity-60")}
          data-testid="home-button"
          disabled={!hasHomeLocation}
          size="icon"
          title="Home"
          variant="secondary"
          onClick={onGoHome}
        >
          <Home className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Set home from center"
          className={iconButtonClassName}
          data-testid="set-home-center"
          size="icon"
          title="Set home from center"
          variant="secondary"
          onClick={onSetHomeFromCenter}
        >
          <MapPinPlus className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Pick home on map"
          aria-pressed={homePickModeEnabled}
          className={iconButtonClassName}
          data-testid="pick-home-on-map"
          size="icon"
          title="Pick home on map"
          variant={homePickModeEnabled ? "default" : "secondary"}
          onClick={onToggleHomePickMode}
        >
          <MousePointerClick className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Show home radius"
          aria-pressed={homeRadiusPreviewEnabled}
          className={cn(iconButtonClassName, !hasHomeLocation && "opacity-60")}
          data-testid="home-radius-preview"
          disabled={!hasHomeLocation}
          size="icon"
          title="10km radius"
          variant={homeRadiusPreviewEnabled ? "default" : "secondary"}
          onClick={onToggleHomeRadiusPreview}
        >
          <CircleDashed className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Paint home radius"
          className={cn(iconButtonClassName, !hasHomeLocation && "opacity-60")}
          data-testid="paint-home-radius"
          disabled={!hasHomeLocation || homeRadiusPainting}
          size="icon"
          title="Paint 10km radius"
          variant="secondary"
          onClick={onRequestHomeRadiusPaint}
        >
          <PaintBucket className="h-4 w-4" />
        </Button>
      </div>

      <div aria-label="Backup tools" className={groupClassName} role="group">
        <Button
          aria-label="Export backup"
          className={iconButtonClassName}
          data-testid="export-backup"
          disabled={backupBusy}
          size="icon"
          title="Export backup"
          variant="secondary"
          onClick={onExportBackup}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Import backup"
          className={iconButtonClassName}
          data-testid="import-backup"
          disabled={backupBusy}
          size="icon"
          title="Import backup"
          variant="secondary"
          onClick={() => backupFileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={backupFileInputRef}
          accept=".json,application/json"
          className="sr-only"
          data-testid="backup-file-input"
          disabled={backupBusy}
          tabIndex={-1}
          type="file"
          onChange={handleBackupFileChange}
        />
      </div>

      <div
        className="flex h-11 items-center gap-2 rounded-md border border-white/10 bg-slate-950/55 px-3"
        data-testid="brush-size-control"
      >
        <Ruler className="h-4 w-4 text-cyan-200" />
        <label className="sr-only" htmlFor="brush-radius-range">
          Brush size
        </label>
        <input
          aria-label="Brush size"
          aria-valuetext={`${brushRadiusMeters} meters`}
          className="h-2 w-28 cursor-pointer accent-cyan-400"
          data-testid="brush-size-range"
          id="brush-radius-range"
          max={MAX_BRUSH_RADIUS_METERS}
          min={MIN_BRUSH_RADIUS_METERS}
          step={BRUSH_RADIUS_STEP_METERS}
          type="range"
          value={brushRadiusMeters}
          onChange={handleBrushRadiusChange}
        />
        <input
          aria-label="Brush size meters"
          className="h-8 w-16 rounded-md border border-white/10 bg-white/10 px-2 text-right text-sm text-slate-50 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/40"
          data-testid="brush-size-input"
          inputMode="numeric"
          max={MAX_BRUSH_RADIUS_METERS}
          min={MIN_BRUSH_RADIUS_METERS}
          step={BRUSH_RADIUS_STEP_METERS}
          type="number"
          value={brushRadiusMeters}
          onChange={handleBrushRadiusChange}
        />
        <span className="text-xs font-medium text-slate-400">m</span>
      </div>
    </div>
  );
}
