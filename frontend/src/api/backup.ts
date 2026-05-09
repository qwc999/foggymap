import type { JsonValue } from "./appState";
import type { HomeLocationInput } from "./homeLocation";
import type { PaintCellInput } from "./paintedCells";

export interface BackupAppStateEntry {
  key: string;
  value: JsonValue;
}

export interface BackupDocument {
  format: string;
  version: number;
  exported_at: string;
  app_state: BackupAppStateEntry[];
  home_location: HomeLocationInput | null;
  painted_cells: PaintCellInput[];
}

export interface BackupImportSummary {
  mode: "overwrite";
  app_state: number;
  painted_cells: number;
  home_location: boolean;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

export class BackupApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "BackupApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function exportBackup(): Promise<BackupDocument> {
  const response = await fetch("/api/backup/export", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  await throwIfRequestFailed(response);

  return (await response.json()) as BackupDocument;
}

export async function importBackupOverwrite(
  backup: BackupDocument,
): Promise<BackupImportSummary> {
  const response = await fetch("/api/backup/import?mode=overwrite", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(backup),
  });

  await throwIfRequestFailed(response);

  return (await response.json()) as BackupImportSummary;
}

async function throwIfRequestFailed(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const fallbackMessage = `API request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as ApiErrorResponse;
    throw new BackupApiError(
      response.status,
      body.message ?? fallbackMessage,
      body.error,
    );
  } catch (error) {
    if (error instanceof BackupApiError) {
      throw error;
    }

    throw new BackupApiError(response.status, fallbackMessage);
  }
}
