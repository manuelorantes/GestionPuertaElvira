import { assertEquals } from '@std/assert';

import { buildApp } from '../../src/container.ts';
import { AuditLabels } from '../../src/infrastructure/audit/mod.ts';
import { TEST_CONFIG } from '../support/http.ts';

/** Peticiones que no cambian datos (o que firman su propia acción, como deshacer y volver a un punto). */
const NOT_CHANGING_DATA = [
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/admin/groups/resolve-schedule',
  'POST /api/admin/billing/quote',
  'POST /api/admin/import/preview',
  'POST /api/admin/audit/actions/:id/undo',
  'POST /api/admin/audit/actions/:id/restore',
];

Deno.test({
  name: 'AuditLabels should name every request that changes data',
  // La aplicación abre su pool de conexiones al montarse, aunque aquí no se use.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    const unnamed = new Set<string>();
    for (const route of buildApp(TEST_CONFIG).hono.routes) {
      if (route.method === 'GET' || route.method === 'ALL') continue;
      const key = `${route.method} ${route.path}`;
      if (NOT_CHANGING_DATA.includes(key)) continue;
      if (AuditLabels.route(route.method, route.path) === null) unnamed.add(key);
    }
    assertEquals([...unnamed], []);
  },
});

Deno.test('AuditLabels should file each request under the section of the app it belongs to', () => {
  const cases: [string, string][] = [
    ['/api/admin/students', 'students'],
    ['/api/admin/import/rows', 'students'],
    ['/api/admin/students/:id/enrolments/:groupId/move', 'groups'],
    ['/api/admin/groups/:id', 'groups'],
    ['/api/admin/billing/accounts/:id/charges/:month/discount', 'charges'],
    ['/api/admin/billing/settings', 'charges'],
    ['/api/admin/billing/payments', 'payments'],
    ['/api/admin/billing/payments/:id/invoice', 'payments'],
    ['/api/teacher/roll-calls/:groupId/:date', 'attendance'],
    ['/api/admin/attendance/comments/:id', 'attendance'],
    ['/api/teacher/fridays/:dutyId/:date/students/:studentId', 'points'],
    ['/api/admin/points/adjustments', 'points'],
    ['/api/admin/teachers/:id', 'teachers'],
    ['/api/admin/payroll/sessions/:id', 'teachers'],
    ['/api/admin/payroll/settlements/:month/payment', 'payroll'],
    ['/api/admin/payroll/advances', 'payroll'],
    ['/api/admin/accounting/invoices', 'accounting'],
    ['/api/admin/equipment/orders/:id/deliver', 'equipment'],
    ['/api/admin/users/:id/role', 'system'],
    ['/api/admin/diagnostics/run', 'system'],
  ];
  assertEquals(
    cases.map(([path]) => [path, AuditLabels.category(path)]),
    cases,
  );
});
