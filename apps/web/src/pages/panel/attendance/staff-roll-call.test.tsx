import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth } from '@/features/billing/money';
import { ADMIN, mockApi, renderApp, SUPERADMIN } from '@/test/render';

const MISSED = [
  {
    sessionId: 'p1',
    groupId: 'g2',
    dutyId: null,
    date: '2026-10-06',
    label: 'Martes 19:00',
    teacherName: 'Carlos Ruiz Márquez',
    locked: false,
    validation: null,
  },
  {
    sessionId: 'p2',
    groupId: null,
    dutyId: 'd1',
    date: '2026-10-16',
    label: 'Viernes',
    teacherName: 'Ángel Castillo Rodriguez',
    locked: false,
    validation: null,
  },
];

const ROLL_CALL = {
  date: '2026-10-06',
  groupId: 'g2',
  dutyId: null,
  label: 'Martes 19:00',
  start: '19:00',
  end: '20:00',
  minutes: 60,
  substitution: false,
  activity: null,
  classroom: 'caballo',
  students: 2,
  rollCall: 'missed',
  period: 'past',
  list: [
    { id: 's1', name: 'Ana Ruiz Gil', present: false },
    { id: 's2', name: 'Pablo Gil Ruiz', present: false },
  ],
  guests: [],
  others: [{ id: 's3', name: 'Lola Ruiz Mora' }],
  teacher: { id: 't2', name: 'Carlos Ruiz Márquez' },
};

const GROUP = {
  id: 'g1',
  name: 'Iniciación A',
  level: 'beginner',
  teacher: { id: 't1', fullName: 'Lucía Moreno Gil' },
  days: ['mon', 'wed'],
  start: '17:00',
  end: '18:00',
  slotLabel: 'Lun y Mié · 17:00–18:00',
  classroom: 'alfil',
  capacity: 12,
  occupied: 1,
  occupancyByDay: {},
  customName: true,
  weeklyPlan: 'two_hours',
};

describe('Superadministración pasa lista', () => {
  it('takes the roll call of a class from the missed roll calls notice', async () => {
    const user = userEvent.setup();
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/attendance/pending': [200, { items: MISSED }],
      'GET /api/admin/roll-calls/g2/2026-10-06': [200, ROLL_CALL],
      'PUT /api/admin/roll-calls/g2/2026-10-06': [204],
    });
    renderApp('/panel');

    const block = await screen.findByRole('region', { name: 'Listas sin pasar' });
    // Solo en las clases: una actividad del club no tiene lista.
    expect(within(block).getAllByRole('link', { name: /Pasar lista/ })).toHaveLength(1);
    await user.click(
      within(block).getByRole('link', { name: 'Pasar lista del 06/10/2026 de Martes 19:00' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Martes 19:00', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Clase de Carlos Ruiz Márquez')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Ana Ruiz Gil/ }));
    await user.click(screen.getByRole('combobox', { name: 'Añadir alumno de otra clase' }));
    await user.click(await screen.findByRole('option', { name: 'Lola Ruiz Mora' }));
    // Sin plazo: no pide confirmar que es una clase pasada.
    await user.click(screen.getByRole('button', { name: 'Guardar lista' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.find(
          ([u, init]) => u === '/api/admin/roll-calls/g2/2026-10-06' && init?.method === 'PUT',
        )?.[1]?.body,
      ).toBe(JSON.stringify({ absent: ['s2'], guests: ['s3'] })),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Lista guardada')).toBeInTheDocument();
  });

  it('is only for superadministration', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/attendance/pending': [200, { items: MISSED }],
    });
    renderApp('/panel');

    const block = await screen.findByRole('region', { name: 'Listas sin pasar' });
    expect(within(block).queryByRole('link', { name: /Pasar lista/ })).not.toBeInTheDocument();
  });

  it('opens the roll call of any day of the group attendance', async () => {
    const month = currentMonth();
    const attendance = (user: typeof ADMIN | typeof SUPERADMIN) =>
      mockApi({
        'GET /api/auth/me': [200, { user }],
        'GET /api/admin/groups': [200, { items: [GROUP] }],
        'GET /api/admin/teachers': [200, { items: [] }],
        [`GET /api/admin/attendance/groups/g1?month=${month}`]: [
          200,
          {
            groupId: 'g1',
            name: 'Iniciación A',
            month,
            days: [
              { date: `${month}-05`, status: 'taken' },
              { date: `${month}-12`, status: 'holiday' },
            ],
            students: [
              {
                id: 's1',
                name: 'Ana Ruiz Gil',
                marks: ['present', null],
                attended: 1,
                classes: 1,
              },
            ],
          },
        ],
      });
    attendance(SUPERADMIN);
    const { unmount } = renderApp('/panel/clases?pestana=asistencia');
    const table = await screen.findByRole('table', { name: /Asistencia de Iniciación A/ });
    expect(
      within(table).getByRole('link', { name: `Pasar lista del 05/${month.slice(5)}` }),
    ).toHaveAttribute('href', `/panel/clases/lista/g1/${month}-05`);
    expect(within(table).getAllByRole('link', { name: /Pasar lista/ })).toHaveLength(1);
    unmount();

    attendance(ADMIN);
    renderApp('/panel/clases?pestana=asistencia');
    const forAdmin = await screen.findByRole('table', { name: /Asistencia de Iniciación A/ });
    expect(within(forAdmin).queryByRole('link', { name: /Pasar lista/ })).not.toBeInTheDocument();
  });
});
