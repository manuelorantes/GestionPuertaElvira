import { InvalidValue } from './errors.ts';

const PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Identificador UUIDv7 (ordenable por tiempo) en minúsculas. */
export function generateUuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const milliseconds = BigInt(Date.now());
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((milliseconds >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${
    hex.slice(20)
  }`;
}

export function parseUuid(value: string): string {
  const normalised = value.toLowerCase();
  if (!PATTERN.test(normalised)) {
    throw new InvalidValue('id', 'Identificador no válido.');
  }
  return normalised;
}

/**
 * Base de los identificadores tipados: cada agregado declara el suyo (`class UserId extends Uuid {}`)
 * para que no se confundan entre sí.
 */
export abstract class Uuid {
  /** Usa `generate()` o `fromString()`: el constructor solo existe para las subclases. */
  constructor(readonly value: string) {}

  static generate<T extends Uuid>(this: new (value: string) => T): T {
    return new this(generateUuidV7());
  }

  static fromString<T extends Uuid>(this: new (value: string) => T, value: string): T {
    return new this(parseUuid(value));
  }

  equals(other: Uuid): boolean {
    return this.constructor === other.constructor && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
