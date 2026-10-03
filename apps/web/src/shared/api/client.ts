/** Error HTTP de la API con el sobre {error: {code, message}} cuando el backend lo envía. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfterSeconds: number | null = null,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }

  /** Campo del formulario al que se refiere el error, si la API lo indica. */
  get field(): string | null {
    return typeof this.details.field === 'string' ? this.details.field : null;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Petición GET a la API (mismo origen, cookies incluidas). */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

/** Petición que cambia estado: siempre JSON (la API rechaza otros formatos). */
export function apiSend<T = void>(method: Method, path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Subida de documentos (multipart). La API solo la admite en sus rutas de subida y con la cabecera
 * X-Requested-With, que un formulario de otro sitio no puede enviar.
 */
export function apiUpload<T = void>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form, headers: { 'X-Requested-With': 'fetch' } });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
    credentials: 'same-origin',
  });
  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => null);

  if (!response.ok) {
    throw toApiError(response, body);
  }

  return body as T;
}

function toApiError(response: Response, body: unknown): ApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const retryAfter = Number(response.headers.get('Retry-After'));

  return new ApiError(
    response.status,
    envelope.error?.code ?? 'http_error',
    envelope.error?.message ?? `HTTP ${response.status}`,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    envelope.error?.details ?? {},
  );
}
