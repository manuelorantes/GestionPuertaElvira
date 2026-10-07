import { hasErrorDetails } from '../../domain/common/mod.ts';
import { TooManyLoginAttempts } from '../../application/identity/mod.ts';
import type { Logger } from '../logging/mod.ts';
import { isUniqueViolation } from '../persistence/sql.ts';

/** Error HTTP con un código propio para el sobre {error: {code, message}}. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
    private readonly extra: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = 'ApiProblem';
  }

  details(): Record<string, string | number | boolean | null> {
    return this.extra;
  }
}

const HTTP_ERRORS: Record<number, [string, string]> = {
  400: ['bad_request', 'Petición incorrecta.'],
  401: ['unauthorized', 'Necesitas iniciar sesión.'],
  403: ['forbidden', 'No tienes permiso para esta acción.'],
  404: ['not_found', 'Recurso no encontrado.'],
  405: ['method_not_allowed', 'Método no permitido.'],
  415: ['unsupported_media_type', 'La petición debe enviarse como JSON.'],
  422: ['unprocessable', 'Los datos enviados no son válidos.'],
  429: ['too_many_requests', 'Demasiados intentos. Prueba más tarde.'],
};

/**
 * Errores operacionales de la aplicación, por nombre de la clase: [estado, código].
 * Cada contexto registra los suyos al arrancar (ver `registerDomainErrors`).
 */
const DOMAIN_ERRORS = new Map<string, [number, string]>([
  ['InvalidCredentials', [401, 'invalid_credentials']],
  ['TooManyLoginAttempts', [429, 'too_many_requests']],
  ['CurrentPasswordMismatch', [422, 'current_password_mismatch']],
  ['WeakPassword', [422, 'weak_password']],
  ['EmailAlreadyRegistered', [409, 'email_already_registered']],
  ['CannotChangeOwnAccount', [409, 'own_account']],
  ['UserNotFound', [404, 'not_found']],
  ['InvalidValue', [422, 'unprocessable']],
  ['PeriodClosed', [409, 'period_closed']],
]);

export function registerDomainErrors(errors: Record<string, [number, string]>): void {
  for (const [name, mapping] of Object.entries(errors)) DOMAIN_ERRORS.set(name, mapping);
}

export function httpError(status: number, headers: Record<string, string> = {}): ApiProblem {
  const [code, message] = HTTP_ERRORS[status] ??
    ['internal_error', 'Se ha producido un error inesperado.'];
  return new ApiProblem(status, code, message, headers);
}

export function errorEnvelope(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
  headers: Record<string, string> = {},
): Response {
  const error: Record<string, unknown> = { code, message };
  if (details && Object.keys(details).length > 0) error.details = details;
  return Response.json({ error }, { status, headers });
}

/** ¿Es un error operacional (conocido) que se responde con su propio código, sin deshacer la petición? */
export function isOperationalError(error: unknown): boolean {
  return error instanceof ApiProblem ||
    (error instanceof Error && DOMAIN_ERRORS.has(error.name)) ||
    isUniqueViolation(error) ||
    (error instanceof Error && error.name === 'InvalidPaymentRequest');
}

/**
 * Traduce cualquier error a un sobre de error JSON uniforme: {"error": {"code": "...", "message": "..."}}.
 * Los errores operacionales usan su propio mensaje (en español); los de programación se registran y no exponen detalles.
 */
export function toErrorResponse(error: unknown, logger: Logger): Response {
  const details = hasErrorDetails(error) ? error.details() : undefined;
  if (error instanceof ApiProblem) {
    return errorEnvelope(error.status, error.code, error.message, details, error.headers);
  }
  if (error instanceof Error && DOMAIN_ERRORS.has(error.name)) {
    const [status, code] = DOMAIN_ERRORS.get(error.name) as [number, string];
    const headers = error instanceof TooManyLoginAttempts
      ? { 'Retry-After': String(error.retryAfterSeconds) }
      : {};
    return errorEnvelope(status, code, error.message, details, headers);
  }
  // Red de seguridad: dos peticiones que crean lo mismo a la vez no deben acabar en un 500.
  if (isUniqueViolation(error)) {
    return errorEnvelope(
      409,
      'conflict',
      'Otra operación acaba de modificar estos datos. Recarga e inténtalo de nuevo.',
    );
  }
  if (error instanceof Error && error.name === 'InvalidPaymentRequest') {
    const reason = (error as Error & { reason(): string }).reason();
    const status = reason === 'beyond_season' || reason === 'nothing_to_pay' ||
        reason === 'whole_year_required'
      ? 409
      : 422;
    return errorEnvelope(status, reason, error.message);
  }
  logger.error('Unhandled API error', {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return errorEnvelope(500, 'internal_error', 'Se ha producido un error inesperado.');
}
