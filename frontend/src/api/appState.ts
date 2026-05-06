export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface AppStateResponse<T extends JsonValue> {
  key: string;
  value: T | null;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function loadAppState<T extends JsonValue>(
  key: string,
): Promise<T | null> {
  const response = await fetch(appStateUrl(key), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as AppStateResponse<T>;
  return body.value;
}

export async function saveAppState<T extends JsonValue>(
  key: string,
  value: T,
): Promise<T> {
  const response = await fetch(appStateUrl(key), {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });

  await throwIfRequestFailed(response);

  const body = (await response.json()) as AppStateResponse<T>;
  return body.value as T;
}

function appStateUrl(key: string): string {
  return `/api/app-state/${encodeURIComponent(key)}`;
}

async function throwIfRequestFailed(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const fallbackMessage = `API request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as ApiErrorResponse;
    throw new ApiRequestError(
      response.status,
      body.message ?? fallbackMessage,
      body.error,
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw error;
    }

    throw new ApiRequestError(response.status, fallbackMessage);
  }
}
