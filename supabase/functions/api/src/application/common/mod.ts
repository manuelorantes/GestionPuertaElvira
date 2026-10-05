import type { LocalDate } from '../../domain/common/mod.ts';

export interface TransactionRunner {
  /** Ejecuta el trabajo de forma atómica: o se confirma entero o no queda nada. */
  run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Bloqueo con nombre hasta el final de la transacción en curso: dos peticiones sobre lo mismo
 * (un doble clic, dos pestañas) se atienden una detrás de otra, y la segunda ve lo que hizo la primera.
 */
export interface Locks {
  acquire(key: string): Promise<void>;
}

/** Ejercicios contables cerrados: nada con fecha dentro de ellos puede cambiar. */
export interface ClosedPeriods {
  isClosed(date: LocalDate): Promise<boolean>;
}

export class PeriodClosed extends Error {
  constructor() {
    super('Esa fecha pertenece a una temporada cerrada: no se puede modificar.');
    this.name = 'PeriodClosed';
  }

  static async guard(periods: ClosedPeriods, date: LocalDate): Promise<void> {
    if (await periods.isClosed(date)) throw new PeriodClosed();
  }
}

/** Etiqueta de la acción del historial en curso (por defecto la da la ruta). */
export interface AuditContext {
  relabel(label: string): Promise<void>;
}
