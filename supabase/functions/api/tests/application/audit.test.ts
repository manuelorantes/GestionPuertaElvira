import { assertEquals, assertRejects, assertThrows } from '@std/assert';

import {
  AuditActionNotFound,
  type AuditActionView,
  type AuditCategory,
  type AuditClassView,
  type AuditDetail,
  type AuditLog,
  type AuditPaymentsPage,
  auditPeriodFrom,
  type AuditReverter,
  auditSectionFrom,
  NothingToUndo,
  periodStart,
  RestoreToPoint,
  UndoAction,
  UndoConflict,
} from '../../src/application/audit/mod.ts';
import { InvalidValue } from '../../src/domain/common/mod.ts';
import { RecordingLocks } from '../support/billing.ts';
import { ImmediateTransactionRunner } from '../support/classes.ts';

function action(id: string, seq: number, label: string): AuditActionView {
  return {
    id,
    seq,
    kind: 'change',
    category: 'teachers',
    userId: null,
    userName: 'Junta',
    label,
    detail: null,
    occurredAt: '',
    changeCount: 1,
    affected: ['Profesor'],
    reverts: null,
    undoable: true,
  };
}

/** Doble del historial: acciones con sus cambios y qué acciones posteriores tocan los mismos registros. */
class FakeAudit implements AuditLog, AuditReverter {
  actionsById = new Map<string, AuditActionView>();
  changesByAction = new Map<string, number[]>();
  conflicts = new Map<string, AuditActionView[]>();
  reverted: number[] = [];
  begun: { label: string; kind: string; reverts: string }[] = [];

  actions(): Promise<AuditActionView[]> {
    return Promise.resolve([...this.actionsById.values()].sort((a, b) => b.seq - a.seq));
  }

  payments(): Promise<AuditPaymentsPage> {
    return Promise.resolve({ items: [], totalCents: 0 });
  }

  classes(): Promise<AuditClassView[]> {
    return Promise.resolve([]);
  }

  action(id: string): Promise<AuditActionView | null> {
    return Promise.resolve(this.actionsById.get(id) ?? null);
  }

  changes(): Promise<AuditDetail> {
    return Promise.resolve({ changes: [], references: {} });
  }

  people(): Promise<{ id: string; name: string }[]> {
    return Promise.resolve([]);
  }

  categories(): Promise<{ category: AuditCategory; count: number }[]> {
    return Promise.resolve([]);
  }

  begin(label: string, kind: string, reverts: string): Promise<void> {
    this.begun.push({ label, kind, reverts });
    return Promise.resolve();
  }

  changesOf(actionId: string): Promise<number[]> {
    return Promise.resolve([...(this.changesByAction.get(actionId) ?? [])].reverse());
  }

  async changesAfter(actionId: string): Promise<number[]> {
    const seq = (await this.action(actionId))?.seq ?? 0;
    const later = [...this.actionsById.values()].filter((a) => a.seq > seq).sort((a, b) =>
      b.seq - a.seq
    );
    return later.flatMap((a) => [...(this.changesByAction.get(a.id) ?? [])].reverse());
  }

  laterActionsTouchingTheSameRecords(actionId: string): Promise<AuditActionView[]> {
    return Promise.resolve(this.conflicts.get(actionId) ?? []);
  }

  revert(changeId: number): Promise<void> {
    this.reverted.push(changeId);
    return Promise.resolve();
  }
}

function setUp() {
  const audit = new FakeAudit();
  audit.actionsById.set('a1', action('a1', 1, 'Crear profesor'));
  audit.actionsById.set('a2', action('a2', 2, 'Editar profesor'));
  audit.actionsById.set('a3', action('a3', 3, 'Inicio de sesión'));
  audit.changesByAction.set('a1', [1]);
  audit.changesByAction.set('a2', [2, 3]);
  const transactions = new ImmediateTransactionRunner();
  const locks = new RecordingLocks();
  return {
    audit,
    undo: new UndoAction(audit, audit, transactions, locks),
    restore: new RestoreToPoint(audit, audit, transactions, locks),
    locks,
  };
}

Deno.test('UndoAction should revert the changes of an action, most recent first, under the revert lock', async () => {
  const { audit, undo, locks } = setUp();
  await undo.execute('a2');
  assertEquals(audit.reverted, [3, 2]);
  assertEquals(audit.begun, [{ label: 'Deshacer: Editar profesor', kind: 'undo', reverts: 'a2' }]);
  assertEquals(locks.keys, ['audit:revert']);
});

Deno.test('UndoAction should refuse unknown actions, actions without changes and conflicts with later actions', async () => {
  const { audit, undo } = setUp();
  await assertRejects(() => undo.execute('nope'), AuditActionNotFound);
  await assertRejects(() => undo.execute('a3'), NothingToUndo);
  audit.conflicts.set('a1', [action('a2', 2, 'Editar profesor')]);
  const conflict = await assertRejects(() => undo.execute('a1'), UndoConflict);
  assertEquals(conflict.details(), { conflicts: 'a2' });
  assertEquals(
    conflict.message,
    'No se puede deshacer: «Editar profesor» (Junta) tocó después los mismos registros. Deshaz antes esa o vuelve a este punto.',
  );
  assertEquals(audit.reverted, []);
});

Deno.test('RestoreToPoint should revert everything after the point and report how much', async () => {
  const { audit, restore } = setUp();
  assertEquals(await restore.execute('a1'), 2);
  assertEquals(audit.reverted, [3, 2]);
  assertEquals(audit.begun[0], {
    label: 'Volver al punto: Crear profesor (Junta)',
    kind: 'restore',
    reverts: 'a1',
  });
  await assertRejects(() => restore.execute('a3'), NothingToUndo);
  await assertRejects(() => restore.execute('nope'), AuditActionNotFound);
});

Deno.test('periodStart should start today, the week and the month at Madrid midnight, or nowhere at all', () => {
  const thursday = new Date('2026-10-15T10:00:00Z');
  assertEquals(periodStart('today', thursday)?.toISOString(), '2026-10-14T22:00:00.000Z');
  assertEquals(periodStart('week', thursday)?.toISOString(), '2026-10-11T22:00:00.000Z');
  assertEquals(periodStart('month', thursday)?.toISOString(), '2026-09-30T22:00:00.000Z');
  assertEquals(periodStart('all', thursday), null);
  assertEquals(auditPeriodFrom('week'), 'week');
  assertThrows(() => auditPeriodFrom('ayer'), InvalidValue);
  assertEquals(auditSectionFrom('payments'), 'payments');
  assertThrows(() => auditSectionFrom('profesores'), InvalidValue);
});
