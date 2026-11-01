import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth } from '@/features/billing/money';
import { ADMIN, mockApi, renderApp, SUPERADMIN, TEACHER } from '@/test/render';

const DETAIL = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Martina López Herrera',
  birthDate: '2014-03-12',
  age: 12,
  nationalId: null,
  contactEmail: null,
  guardians: [{ name: 'Rocío Herrera', phone: '699 00 01 11' }],
  ownPhone: null,
  federationLicence: null,
  imageConsent: true,
  missingData: [],
  joinedOn: '2026-09-15',
  withdrawnOn: null,
  status: 'active',
  membership: [{ joinedOn: '2026-09-15', withdrawnOn: null }],
  groups: [],
  siblings: [],
};

const change = (
  fields: { field: string; before: unknown; after: unknown }[],
  table = 'students_student',
) => ({
  table,
  tableLabel: table === 'students_student' ? 'Alumno' : 'Inscripción',
  title: null,
  key: { id: 's1' },
  operation: 'U',
  fields,
  target: null,
});

const HISTORY_1 = {
  items: [
    {
      id: 'a2',
      seq: 20,
      label: 'Editar alumno',
      userName: 'Manuel',
      occurredAt: '2026-10-20T18:27:00+02:00',
      changes: [
        change([
          {
            field: 'guardians',
            before: [{ name: 'Rocío Herrera', phone: '612481930' }],
            after: [{ name: 'Rocío Herrera', phone: '699000111' }],
          },
        ]),
      ],
    },
  ],
  references: {},
  nextBefore: 20,
};
const HISTORY_2 = {
  items: [
    {
      id: 'a1',
      seq: 10,
      label: 'Mover de grupo',
      userName: 'Club Ajedrez Puerta Elvira',
      occurredAt: '2026-10-19T18:27:00+02:00',
      changes: [
        change([{ field: 'class_group_id', before: 'g1', after: 'g2' }], 'classes_enrolment'),
      ],
    },
  ],
  references: {
    g1: { kind: 'group', label: 'Miércoles 17:00', target: null },
    g2: { kind: 'group', label: 'Lunes y miércoles 18:30', target: null },
  },
  nextBefore: null,
};

const month = currentMonth();
const POINTS = [
  {
    id: 'p2',
    studentId: 's1',
    studentName: 'Martina López Herrera',
    date: `${month}-06`,
    delta: 2,
    kind: 'friday',
    concept: 'Viernes 6',
    by: null,
  },
  {
    id: 'p1',
    studentId: 's1',
    studentName: 'Martina López Herrera',
    date: '2026-09-12',
    delta: -5,
    kind: 'redemption',
    concept: 'R-2026-0010',
    by: null,
  },
];

function api(user: object) {
  return mockApi({
    'GET /api/auth/me': [200, { user }],
    'GET /api/admin/students/pending-data': [200, { items: [] }],
    'GET /api/admin/groups': [200, { items: [] }],
    'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
    'GET /api/admin/students/s1': [200, DETAIL],
    'GET /api/admin/students/s1/points': [200, { items: POINTS }],
    'GET /api/admin/students/s1/history': [200, HISTORY_1],
    'GET /api/admin/students/s1/history?before=20': [200, HISTORY_2],
  });
}

describe('Ficha del alumno: historiales', () => {
  it('shows the superadministration what changed in the student, loading older changes on demand', async () => {
    const user = userEvent.setup();
    api(SUPERADMIN);
    renderApp('/panel/alumnos/s1');

    const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
    const list = await within(card).findByRole('list', { name: 'Historial de cambios' });
    expect(list).toHaveTextContent('Editar alumno');
    expect(list).toHaveTextContent('Manuel');
    expect(list).toHaveTextContent('699000111');
    await user.click(within(card).getByRole('button', { name: 'Ver más' }));
    expect(await within(list).findByText('Mover de grupo')).toBeVisible();
    expect(list).toHaveTextContent('Lunes y miércoles 18:30');
    expect(within(card).queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('does not show the history of changes to administration or teachers, but shows the points', async () => {
    for (const user of [ADMIN, TEACHER]) {
      const spy = api(user);
      const { unmount } = renderApp('/panel/alumnos/s1');
      const card = await screen.findByRole('dialog', { name: 'Martina López Herrera' });
      const points = await within(card).findByRole('table', { name: 'Movimientos de puntos' });
      expect(within(card).getByText('Puntos de este mes:')).toHaveTextContent('2');
      expect(points).toHaveTextContent('Viernes 6');
      expect(points).toHaveTextContent('+2');
      expect(points).toHaveTextContent('Canje');
      expect(points).toHaveTextContent('−5');
      expect(within(card).queryByText('Historial de cambios')).not.toBeInTheDocument();
      expect(spy.mock.calls.some(([url]) => String(url).includes('/history'))).toBe(false);
      unmount();
    }
  });
});
