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

/**
 * Lo conciliado con el extracto del banco (cobros, apuntes, facturas y traspasos casados con un movimiento): su forma de
 * pago, su fecha y su importe ya no cambian ni se borra, salvo deshaciendo antes la conciliación.
 */
export interface ReconciledItems {
  isReconciled(source: string, sourceId: string): Promise<boolean>;
}

export class ReconciledWithBank extends Error {
  constructor() {
    super(
      'Está conciliado con el banco: no se puede cambiar su forma de pago, fecha ni importe, ni borrar. ' +
        'Si está mal, deshaz antes la conciliación.',
    );
    this.name = 'ReconciledWithBank';
  }

  /** Falla si lo indicado está conciliado: se llama solo cuando el cambio toca lo que cuadra con el banco. */
  static async guard(items: ReconciledItems, source: string, sourceId: string): Promise<void> {
    if (await items.isReconciled(source, sourceId)) throw new ReconciledWithBank();
  }
}
