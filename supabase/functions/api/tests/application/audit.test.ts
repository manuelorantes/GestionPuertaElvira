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
  type EnrolmentSnapshot,
  groupsAroundAction,
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
    return Promise.resolve({ changes: [], references: {}, studentGroups: [] });
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

const enrolment = (
  id: string,
  groupId: string,
  enrolledOn: string,
  endsOn: string | null = null,
  studentId = 'ana',
): EnrolmentSnapshot => ({ id, studentId, groupId, enrolledOn, endsOn });

Deno.test('groupsAroundAction should list every group before and after removing a student from one', () => {
  const tuesday = enrolment('e1', 'tuesday', '2026-09-01');
  const wednesday = enrolment('e2', 'wednesday', '2026-09-01');
  const removed = { ...tuesday, endsOn: '2026-10-26' };
  const around = groupsAroundAction({
    day: '2026-10-26',
    current: [removed, wednesday],
    later: [],
    own: [{ before: tuesday, after: removed }],
  });
  assertEquals(around, [{
    studentId: 'ana',
    before: [
      { groupId: 'tuesday', startsOn: null, endsOn: null },
      { groupId: 'wednesday', startsOn: null, endsOn: null },
    ],
    after: [{ groupId: 'wednesday', startsOn: null, endsOn: null }],
  }]);
});

Deno.test('groupsAroundAction should show the groups of that moment even after the action was undone', () => {
  const tuesday = enrolment('e1', 'tuesday', '2026-09-01');
  const removed = { ...tuesday, endsOn: '2026-10-26' };
  // Hoy vuelve a estar en el grupo: el deshacer posterior devolvió la inscripción a como estaba.
  const around = groupsAroundAction({
    day: '2026-10-26',
    current: [tuesday],
    later: [{ before: removed, after: tuesday }],
    own: [{ before: tuesday, after: removed }],
  });
  assertEquals(around[0]?.before, [{ groupId: 'tuesday', startsOn: null, endsOn: null }]);
  assertEquals(around[0]?.after, []);
});

Deno.test('groupsAroundAction should follow new and deleted enrolments, with their start and end dates', () => {
  const old = enrolment('e1', 'monday', '2026-09-01', '2026-10-15');
  const moved = enrolment('e2', 'friday', '2026-11-01', '2026-12-20');
  const later = enrolment('e3', 'thursday', '2026-10-20');
  const around = groupsAroundAction({
    day: '2026-10-15',
    // Luego se le inscribió en otro grupo y se borró la inscripción del de los viernes.
    current: [old, later],
    later: [{ before: null, after: later }, { before: moved, after: null }],
    own: [{ before: { ...old, endsOn: null }, after: old }, { before: null, after: moved }],
  });
  assertEquals(around, [{
    studentId: 'ana',
    before: [{ groupId: 'monday', startsOn: null, endsOn: null }],
    after: [{ groupId: 'friday', startsOn: '2026-11-01', endsOn: '2026-12-20' }],
  }]);
});

Deno.test('groupsAroundAction should answer for each student the action touched, and only them', () => {
  const ana = enrolment('e1', 'tuesday', '2026-09-01');
  const leo = enrolment('e2', 'tuesday', '2026-10-15', null, 'leo');
  const other = enrolment('e3', 'tuesday', '2026-09-01', null, 'eva');
  const around = groupsAroundAction({
    day: '2026-10-15',
    current: [ana, leo, other],
    later: [],
    own: [{ before: null, after: leo }],
  });
  assertEquals(around, [{
    studentId: 'leo',
    before: [],
    after: [{ groupId: 'tuesday', startsOn: null, endsOn: null }],
  }]);
});
