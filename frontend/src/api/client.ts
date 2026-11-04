import type { ApiError as ApiErrorBody, Dataset, HealthResponse } from '@contracts';
import { track } from '@/lib/loading';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    // Not JSON (for example a proxy error page).
  }
  if (body?.error) {
    throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  }
  if (res.status === 413) {
    throw new ApiError(
      413,
      'file_too_large',
      'The upload is too large. Together the two files must be 4 MB or smaller.',
    );
  }
  throw new ApiError(
    res.status,
    'http_error',
    `The server answered ${res.status} ${res.statusText}.`,
  );
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health', { cache: 'no-store' });
  return handle<HealthResponse>(res);
}

export async function fetchSampleDataset(signal?: AbortSignal): Promise<Dataset> {
  return track(async () => handle<Dataset>(await fetch('/api/datasets/sample', { signal })));
}

export async function analyzeFiles(files: File[], asOf?: string): Promise<Dataset> {
  const form = new FormData();
  files.forEach((file, i) => form.append(`file${i + 1}`, file, file.name));
  if (asOf) form.append('asOf', asOf);
  return track(async () =>
    handle<Dataset>(await fetch('/api/datasets/analyze', { method: 'POST', body: form })),
  );
}
