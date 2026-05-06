export type MapMode = "street" | "satellite";

export type MapProviderStatus = "ready" | "candidate";

export interface MapProvider {
  id: string;
  mode: MapMode;
  label: string;
  status: MapProviderStatus;
  attribution: string;
  documentationUrl?: string;
  termsUrl?: string;
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
    attribution:
      '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>',
    minZoom: 0,
    maxZoom: 19,
    tileUrlTemplates: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    notes: [
      "Development provider only. The app must keep map providers replaceable and avoid heavy usage of public OSM tile servers.",
    ],
  },
  {
    id: "nasa-gibs-modis-terra-true-color",
    mode: "satellite",
    label: "NASA GIBS MODIS Terra True Color",
    status: "ready",
    attribution:
      'Imagery: <a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api">NASA GIBS / EOSDIS</a>',
    documentationUrl: "https://nasa-gibs.github.io/gibs-api-docs/access-basics/",
    termsUrl:
      "https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance",
    minZoom: 0,
    maxZoom: 9,
    tileUrlTemplates: [
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    ],
    notes: [
      "Free/open NASA GIBS Web Mercator WMTS layer selected as the legally clean MVP satellite provider.",
      "Limited to GoogleMapsCompatible_Level9 in EPSG:3857, about 305.75 meters per pixel at the finest native tile level; this is not high-resolution city imagery.",
      "Online service only. Offline use needs a future tile package or cache; the app does not store base imagery.",
      "OpenAerialMap remains a candidate for future optional imagery, but its coverage is catalog-based and uneven for a global default basemap.",
    ],
  },
] as const satisfies readonly MapProvider[];

export type MapProviderId = (typeof MAP_PROVIDERS)[number]["id"];

export const DEFAULT_PROVIDER_BY_MODE = {
  street: "osm-raster-dev",
  satellite: "nasa-gibs-modis-terra-true-color",
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
