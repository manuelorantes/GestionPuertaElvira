/**
 * Error operacional que aporta datos estructurados para que la persona usuaria pueda actuar
 * (p. ej. con qué grupo coincide un horario). Nunca debe incluir datos personales sensibles.
 */
export interface HasErrorDetails {
  details(): Record<string, string | number | boolean | null>;
}

export function hasErrorDetails(error: unknown): error is Error & HasErrorDetails {
  return error instanceof Error &&
    typeof (error as Partial<HasErrorDetails>).details === 'function';
}

/**
 * Un valor de entrada no cumple las reglas de un value object. Es un error operacional:
 * se traduce a una respuesta 422 en el borde HTTP.
 */
export class InvalidValue extends Error implements HasErrorDetails {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidValue';
  }

  details(): Record<string, string> {
    return { field: this.field };
  }
}
