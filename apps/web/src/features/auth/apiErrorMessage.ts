import { ApiError } from '@/shared/api/client';

const CONNECTION_PROBLEM = 'No se ha podido conectar. Inténtalo de nuevo.';

/** Traduce un error de la API a un mensaje para la persona usuaria. */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError) || error.status >= 500) return CONNECTION_PROBLEM;

  if (error.code === 'too_many_requests') {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
    return `Demasiados intentos. Prueba de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
  }

  return error.message;
}
