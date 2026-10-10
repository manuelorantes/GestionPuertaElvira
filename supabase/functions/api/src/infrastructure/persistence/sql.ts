import postgres from 'postgres';

import type { Locks, TransactionRunner } from '../../application/common/mod.ts';
import type { DatabaseHealth } from '../../application/health/mod.ts';

/** Conexión (o transacción) de postgres.js con la que trabajan los adaptadores. */
export type Sql = postgres.Sql | postgres.TransactionSql;
export type TransactionSql = postgres.TransactionSql;
export type Db = postgres.Sql;

/**
 * Cliente de PostgreSQL. Sin sentencias preparadas: así vale contra el pooler de Supabase
 * en modo transacción (ver backend-en-deno-sobre-supabase.md).
 */
export function createDb(url: string, options: { max?: number } = {}): Db {
  return postgres(url, {
    prepare: false,
    max: options.max ?? 4,
    idle_timeout: 30,
    connect_timeout: 10,
    // Las fechas con zona se devuelven como Date; las fechas sin hora (date) como texto AAAA-MM-DD.
    types: {
      date: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v },
    },
  });
}

/** Cada petición es una transacción: dentro valen los bloqueos y las variables de sesión del historial. */
export async function inTransaction<T>(
  db: Db,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return await db.begin(work) as T;
}

/**
 * El trabajo atómico de un caso de uso, dentro de la transacción de la petición, es un punto de guardado:
 * si falla se deshace solo esa parte (p. ej. una fila de la importación) y la petición sigue.
 */
export class SavepointTransactionRunner implements TransactionRunner {
  constructor(private readonly tx: postgres.TransactionSql) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    return await this.tx.savepoint(() => work()) as T;
  }
}

/** Bloqueos `pg_advisory_xact_lock`: se liberan solos al confirmar o deshacer la transacción. */
export class PostgresAdvisoryLocks implements Locks {
  constructor(private readonly tx: postgres.TransactionSql) {}

  async acquire(key: string): Promise<void> {
    await this.tx`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export class SqlDatabaseHealth implements DatabaseHealth {
  constructor(private readonly db: Db) {}

  async isReachable(): Promise<boolean> {
    try {
      await this.db`SELECT 1`;
      return true;
    } catch {
      // Fallo operacional esperado: la comprobación de salud lo informa en vez de propagarlo.
      return false;
    }
  }
}

/**
 * Lectura tipada de una fila SQL: falla rápido si la columna no tiene el tipo esperado.
 */
export class Row {
  constructor(private readonly values: Record<string, unknown>) {}

  static all(rows: Iterable<object | undefined>): Row[] {
    return [...rows].flatMap((values) =>
      values ? [new Row(values as Record<string, unknown>)] : []
    );
  }

  string(column: string): string {
    const value = this.values[column];
    if (typeof value !== 'string') throw new Error(`Columna ${column}: se esperaba texto`);
    return value;
  }

  nullableString(column: string): string | null {
    return this.values[column] === null || this.values[column] === undefined
      ? null
      : this.string(column);
  }

  int(column: string): number {
    const value = this.values[column];
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
    throw new Error(`Columna ${column}: se esperaba un número`);
  }

  nullableInt(column: string): number | null {
    return this.values[column] === null || this.values[column] === undefined
      ? null
      : this.int(column);
  }

  bool(column: string): boolean {
    const value = this.values[column];
    if (typeof value !== 'boolean') throw new Error(`Columna ${column}: se esperaba un booleano`);
    return value;
  }

  date(column: string): Date {
    const value = this.values[column];
    if (!(value instanceof Date)) {
      throw new Error(`Columna ${column}: se esperaba una fecha con hora`);
    }
    return value;
  }

  nullableDate(column: string): Date | null {
    return this.values[column] === null || this.values[column] === undefined
      ? null
      : this.date(column);
  }

  json(column: string): unknown {
    const value = this.values[column];
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  stringList(column: string): string[] {
    const value = this.json(column);
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`Columna ${column}: se esperaba una lista de textos`);
    }
    return value;
  }

  intList(column: string): number[] {
    const value = this.json(column);
    if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item))) {
      throw new Error(`Columna ${column}: se esperaba una lista de enteros`);
    }
    return value as number[];
  }
}

/** Violación de unicidad: dos peticiones que crean lo mismo a la vez. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof postgres.PostgresError && error.code === '23505';
}
