import { assertEquals } from '@std/assert';

import { auditTarget } from '../../src/infrastructure/persistence/audit.ts';

Deno.test('auditTarget should point each change to the place where it is managed', () => {
  const cases: [
    string,
    string,
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    unknown,
  ][] = [
    ['billing_payment', 'U', { id: 'p1' }, { id: 'p1', paid_on: '2026-10-06' }, {
      kind: 'payment',
      id: 'p1',
    }],
    ['students_student', 'I', null, { id: 's1' }, { kind: 'student', id: 's1' }],
    ['billing_account', 'U', null, { student_id: 's1' }, { kind: 'student', id: 's1' }],
    ['classes_enrolment', 'D', { student_id: 's1' }, null, { kind: 'student', id: 's1' }],
    ['classes_group', 'U', null, { id: 'g1' }, { kind: 'group', id: 'g1' }],
    ['teachers_teacher', 'I', null, { id: 't1' }, { kind: 'teacher', id: 't1' }],
    ['billing_charge', 'U', null, { period: '2026-10' }, { kind: 'charges', month: '2026-10' }],
    ['accounting_entry', 'I', null, { entry_date: '2026-10-02' }, {
      kind: 'ledger',
      month: '2026-10',
    }],
    ['accounting_invoice', 'U', null, { id: 'i1' }, { kind: 'invoices' }],
    [
      'payroll_session',
      'U',
      null,
      { teacher_id: 't1', session_date: '2026-10-05' },
      { kind: 'hours', month: '2026-10', teacherId: 't1' },
    ],
    ['payroll_settlement', 'U', null, { month: '2026-09' }, {
      kind: 'settlement',
      month: '2026-09',
    }],
    ['billing_settings', 'U', null, { id: 1 }, { kind: 'billing-settings' }],
    // Lo que ya no existe no tiene dónde ir; las cuentas de usuario no tienen pantalla.
    ['billing_payment', 'D', { id: 'p1' }, null, null],
    ['students_student', 'D', { id: 's1' }, null, null],
    ['identity_user', 'U', null, { id: 'u1' }, null],
  ];
  for (const [table, operation, before, after, expected] of cases) {
    assertEquals(auditTarget(table, operation, before, after), expected, `${table} ${operation}`);
  }
});
