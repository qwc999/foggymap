export interface HomeLocationInput {
  longitude: number;
  latitude: number;
  zoom: number | null;
}

export interface HomeLocation extends HomeLocationInput {
  updated_at: string;
}

interface HomeLocationResponse {
  home_location: HomeLocation | null;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export class HomeLocationApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "HomeLocationApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function loadHomeLocation(): Promise<HomeLocation | null> {
  const response = await fetch("/api/home-location", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as HomeLocationResponse;
  return body.home_location;
}

export async function saveHomeLocation(
  homeLocation: HomeLocationInput,
): Promise<HomeLocation> {
  const response = await fetch("/api/home-location", {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(homeLocation),
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as HomeLocationResponse;

  if (!body.home_location) {
    throw new HomeLocationApiError(
      response.status,
      "Home location API returned an empty response",
    );
  }

  return body.home_location;
}

export async function clearHomeLocation(): Promise<null> {
  const response = await fetch("/api/home-location", {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as HomeLocationResponse;

  if (body.home_location) {
    throw new HomeLocationApiError(
      response.status,
      "Home location API returned a non-empty clear response",
    );
  }

  return null;
}

async function throwIfRequestFailed(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const fallbackMessage = `API request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as ApiErrorResponse;
    throw new HomeLocationApiError(
      response.status,
      body.message ?? fallbackMessage,
      body.error,
    );
  } catch (error) {
    if (error instanceof HomeLocationApiError) {
      throw error;
    }

    throw new HomeLocationApiError(response.status, fallbackMessage);
  }
}
