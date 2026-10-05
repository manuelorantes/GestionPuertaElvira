import { assertEquals, assertRejects } from '@std/assert';

import {
  AuditActionNotFound,
  type AuditActionView,
  type AuditLog,
  type AuditReverter,
  NothingToUndo,
  RestoreToPoint,
  UndoAction,
  UndoConflict,
} from '../../src/application/audit/mod.ts';
import { RecordingLocks } from '../support/billing.ts';
import { ImmediateTransactionRunner } from '../support/classes.ts';

function action(id: string, seq: number, label: string): AuditActionView {
  return {
    id,
    seq,
    kind: 'change',
    userId: null,
    userName: 'Junta',
    label,
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

  action(id: string): Promise<AuditActionView | null> {
    return Promise.resolve(this.actionsById.get(id) ?? null);
  }

  changes(): Promise<never[]> {
    return Promise.resolve([]);
  }

  people(): Promise<{ id: string; name: string }[]> {
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
