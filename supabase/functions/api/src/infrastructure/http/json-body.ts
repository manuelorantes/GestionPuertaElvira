import { InvalidValue } from '../../domain/common/mod.ts';

/**
 * Lectura estricta de un cuerpo JSON: cada campo se pide con su tipo y si es obligatorio.
 */
export class JsonBody {
  private constructor(private readonly data: Record<string, unknown>) {}

  static fromUnknown(data: unknown): JsonBody {
    return new JsonBody(
      typeof data === 'object' && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {},
    );
  }

  static async from(request: Request): Promise<JsonBody> {
    return JsonBody.fromUnknown(await request.json().catch(() => null));
  }

  requiredString(field: string): string {
    const value = this.data[field];
    if (typeof value !== 'string' || value.trim() === '') throw missing(field);
    return value;
  }

  optionalString(field: string): string | null {
    const value = this.data[field];
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
      throw new InvalidValue(field, `El campo «${field}» debe ser texto.`);
    }
    return value;
  }

  requiredInt(field: string): number {
    const value = this.data[field];
    if (typeof value !== 'number' || !Number.isInteger(value)) throw missing(field);
    return value;
  }

  optionalInt(field: string): number | null {
    const value = this.data[field];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new InvalidValue(field, `El campo «${field}» debe ser un número entero.`);
    }
    return value;
  }

  optionalNumber(field: string): number | null {
    const value = this.data[field];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number') {
      throw new InvalidValue(field, `El campo «${field}» debe ser un número.`);
    }
    return value;
  }

  bool(field: string, fallback = false): boolean {
    const value = this.data[field] ?? fallback;
    if (typeof value !== 'boolean') {
      throw new InvalidValue(field, `El campo «${field}» debe ser verdadero o falso.`);
    }
    return value;
  }

  stringList(field: string): string[] {
    const value = this.data[field] ?? [];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new InvalidValue(field, `El campo «${field}» debe ser una lista de textos.`);
    }
    return value as string[];
  }

  objectList(field: string): JsonBody[] {
    const value = this.data[field] ?? [];
    if (
      !Array.isArray(value) || !value.every((item) => typeof item === 'object' && item !== null)
    ) {
      throw new InvalidValue(field, `El campo «${field}» debe ser una lista.`);
    }
    return (value as unknown[]).map((item) => JsonBody.fromUnknown(item));
  }

  optionalObject(field: string): JsonBody | null {
    const value = this.data[field];
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidValue(field, `El campo «${field}» debe ser un objeto.`);
    }
    return JsonBody.fromUnknown(value);
  }

  stringMap(field: string): Record<string, string> {
    const value = this.data[field] ?? {};
    if (
      typeof value !== 'object' || value === null || Array.isArray(value) ||
      !Object.values(value).every((item) => typeof item === 'string')
    ) {
      throw new InvalidValue(field, `El campo «${field}» debe asociar textos.`);
    }
    return value as Record<string, string>;
  }
}

function missing(field: string): InvalidValue {
  return new InvalidValue(field, `El campo «${field}» es obligatorio.`);
}
