import type { HasErrorDetails } from '../../domain/common/mod.ts';
import type { Locks, TransactionRunner } from '../common/mod.ts';

/** Una acción del historial: quién, cuándo, qué y cuántos registros tocó. */
export interface AuditActionView {
  id: string;
  seq: number;
  kind: string;
  userId: string | null;
  userName: string;
  label: string;
  occurredAt: string;
  changeCount: number;
  /** Nombres legibles de lo que tocó (p. ej. «Cobro», «Cuota»). */
  affected: string[];
  reverts: string | null;
  undoable: boolean;
}

/** Un registro tocado por una acción, con los campos que cambiaron (sin contraseñas). */
export interface AuditChangeView {
  table: string;
  tableLabel: string;
  key: Record<string, unknown>;
  operation: string;
  fields: { field: string; before: unknown; after: unknown }[];
}

export interface AuditFilter {
  userId?: string | null;
  beforeSeq?: number | null;
  limit?: number;
}

export interface AuditLog {
  /** Acciones del historial, de la más reciente a la más antigua. */
  actions(filter: AuditFilter): Promise<AuditActionView[]>;
  action(id: string): Promise<AuditActionView | null>;
  changes(actionId: string): Promise<AuditChangeView[]>;
  /** Personas que aparecen en el historial. */
  people(): Promise<{ id: string; name: string }[]>;
}

/** Reversión de cambios registrados. Se usa dentro de una transacción. */
export interface AuditReverter {
  /** Abre la acción que firma la reversión (los cambios que haga quedan registrados con ella). */
  begin(label: string, kind: string, reverts: string): Promise<void>;
  /** Cambios revertibles de la acción, del más reciente al más antiguo. */
  changesOf(actionId: string): Promise<number[]>;
  /** Cambios revertibles posteriores a la acción, del más reciente al más antiguo. */
  changesAfter(actionId: string): Promise<number[]>;
  /** Acciones posteriores que tocaron alguno de los registros de esta. */
  laterActionsTouchingTheSameRecords(actionId: string): Promise<AuditActionView[]>;
  revert(changeId: number): Promise<void>;
}

export class AuditActionNotFound extends Error {
  constructor() {
    super('No existe esa acción del historial.');
    this.name = 'AuditActionNotFound';
  }
}

export class NothingToUndo extends Error {
  constructor() {
    super('Esa acción no tiene cambios que se puedan deshacer.');
    this.name = 'NothingToUndo';
  }
}

/** Una acción posterior tocó los mismos registros: deshacer esta rompería la posterior. */
export class UndoConflict extends Error implements HasErrorDetails {
  constructor(private readonly later: AuditActionView[]) {
    const first = later[0];
    super(
      first
        ? `No se puede deshacer: «${first.label}» (${first.userName}) tocó después los mismos registros. Deshaz antes esa o vuelve a este punto.`
        : 'Una acción posterior tocó los mismos registros.',
    );
    this.name = 'UndoConflict';
  }

  details(): Record<string, string> {
    return { conflicts: this.later.map((a) => a.id).join(', ') };
  }
}

/** Deshace una acción concreta, siempre que nada posterior haya tocado sus registros. */
export class UndoAction {
  constructor(
    private readonly log: AuditLog,
    private readonly reverter: AuditReverter,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  execute(actionId: string): Promise<void> {
    return this.transactions.run(async () => {
      await this.locks.acquire('audit:revert');
      const action = await this.log.action(actionId);
      if (action === null) throw new AuditActionNotFound();
      const changes = await this.reverter.changesOf(actionId);
      if (changes.length === 0) throw new NothingToUndo();
      const later = await this.reverter.laterActionsTouchingTheSameRecords(actionId);
      if (later.length > 0) throw new UndoConflict(later);
      await this.reverter.begin(`Deshacer: ${action.label}`, 'undo', actionId);
      for (const change of changes) await this.reverter.revert(change);
    });
  }
}

/** Devuelve todos los datos del club al estado justo después de una acción, deshaciendo todo lo posterior. */
export class RestoreToPoint {
  constructor(
    private readonly log: AuditLog,
    private readonly reverter: AuditReverter,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  /** @returns cambios revertidos */
  execute(actionId: string): Promise<number> {
    return this.transactions.run(async () => {
      await this.locks.acquire('audit:revert');
      const action = await this.log.action(actionId);
      if (action === null) throw new AuditActionNotFound();
      const changes = await this.reverter.changesAfter(actionId);
      if (changes.length === 0) throw new NothingToUndo();
      await this.reverter.begin(
        `Volver al punto: ${action.label} (${action.userName})`,
        'restore',
        actionId,
      );
      for (const change of changes) await this.reverter.revert(change);
      return changes.length;
    });
  }
}
