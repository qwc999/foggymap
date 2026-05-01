export type MapMode = "street" | "satellite";

export type MapProviderStatus = "ready" | "candidate" | "placeholder";

export interface MapProvider {
  id: string;
  mode: MapMode;
  label: string;
  status: MapProviderStatus;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileUrlTemplates: string[];
  notes: string[];
}

export const MAP_PROVIDERS = [
  {
    id: "osm-raster-dev",
    mode: "street",
    label: "OpenStreetMap Raster Dev",
    status: "ready",
    attribution: "© OpenStreetMap contributors",
    minZoom: 0,
    maxZoom: 19,
    tileUrlTemplates: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    notes: [
      "Development provider only. The app must keep map providers replaceable and avoid heavy usage of public OSM tile servers.",
    ],
  },
  {
    id: "satellite-unconfigured",
    mode: "satellite",
    label: "Satellite Provider Placeholder",
    status: "placeholder",
    attribution: "",
    minZoom: 0,
    maxZoom: 0,
    tileUrlTemplates: [],
    notes: [
      "Satellite imagery requires a separate evaluation task before choosing a legally clean default provider.",
    ],
  },
] as const satisfies readonly MapProvider[];

export type MapProviderId = (typeof MAP_PROVIDERS)[number]["id"];

export const DEFAULT_PROVIDER_BY_MODE = {
  street: "osm-raster-dev",
  satellite: "satellite-unconfigured",
} as const satisfies Record<MapMode, MapProviderId>;

export function getProvidersForMode(mode: MapMode): MapProvider[] {
  return MAP_PROVIDERS.filter((provider) => provider.mode === mode);
}

export function getProviderById(providerId: string): MapProvider | undefined {
  return MAP_PROVIDERS.find((provider) => provider.id === providerId);
}

export function getDefaultProvider(mode: MapMode): MapProvider {
  const provider = getProviderById(DEFAULT_PROVIDER_BY_MODE[mode]);

  if (!provider) {
    throw new Error(`Missing default provider for mode "${mode}"`);
  }

  return provider;
}

export function resolveProvider(
  mode: MapMode,
  preferredProviderId?: string | null,
): MapProvider {
  const preferredProvider = preferredProviderId
    ? getProviderById(preferredProviderId)
    : undefined;

  if (preferredProvider?.mode === mode) {
    return preferredProvider;
  }

  return getDefaultProvider(mode);
}
