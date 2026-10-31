import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth, monthLabel } from '@/features/billing/money';
import { todayIso } from '@/features/students/format';
import { ADMIN, mockApi, renderApp, SUPERADMIN } from '@/test/render';

const TEACHERS = [
  { id: 't1', fullName: 'Lucía Moreno Gil', active: true, groupCount: 2, hourlyRate: '16.00' },
  { id: 't2', fullName: 'Carlos Ruiz Márquez', active: true, groupCount: 1, hourlyRate: '18.00' },
];
const GROUPS = [
  {
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
    occupied: 10,
    occupancyByDay: {},
    customName: true,
    weeklyPlan: 'two_hours',
  },
];
const session = (overrides: Record<string, unknown>) => ({
  id: 's1',
  date: '2026-09-07',
  teacherId: 't1',
  teacherName: 'Lucía Moreno Gil',
  groupId: 'g1',
  label: 'Iniciación A',
  minutes: 60,
  countedMinutes: 60,
  overlapsWith: [],
  costCents: 1600,
  fromSchedule: true,
  locked: false,
  substitution: false,
  ...overrides,
});
const SETTLEMENTS = [
  {
    teacherId: 't2',
    teacherName: 'Carlos Ruiz Márquez',
    month: '2026-09',
    minutes: 360,
    rateCents: 1800,
    amountCents: 10800,
    lines: [{ label: 'Adultos I', minutes: 360, amountCents: 10800 }],
    status: 'paid',
    paidOn: '2026-10-02',
  },
  {
    teacherId: 't1',
    teacherName: 'Lucía Moreno Gil',
    month: '2026-09',
    minutes: 480,
    rateCents: 1600,
    amountCents: 12800,
    lines: [{ label: 'Iniciación A', minutes: 480, amountCents: 12800 }],
    status: 'pending',
    paidOn: null,
  },
];

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/teachers': [200, { items: TEACHERS }],
    'GET /api/admin/groups': [200, { items: GROUPS }],
    'GET /api/admin/payroll/profitability?month=2026-09': [
      200,
      {
        month: '2026-09',
        items: [
          {
            teacherId: 't1',
            teacherName: 'Lucía Moreno Gil',
            groups: ['Iniciación A'],
            minutes: 480,
            rateCents: 1600,
            costCents: 12800,
            incomeCents: 45000,
            marginCents: 32200,
            incomePerHourCents: 5625,
            occupied: 10,
            occupancyByDay: {},
            capacity: 12,
            students: 10,
          },
          {
            teacherId: 't2',
            teacherName: 'Carlos Ruiz Márquez',
            groups: ['Adultos I'],
            minutes: 360,
            rateCents: 1800,
            costCents: 10800,
            incomeCents: 20000,
            marginCents: 9200,
            incomePerHourCents: 3333,
            occupied: 6,
            occupancyByDay: {},
            capacity: 12,
            students: 6,
          },
        ],
        // Ana va con los dos: 10 + 6 en las filas, 15 alumnos distintos.
        students: {
          total: 15,
          shared: [{ id: 's7', name: 'Ana Pérez' }],
        },
      },
    ],
    'GET /api/admin/payroll/sessions?month=2026-09': [
      200,
      {
        month: '2026-09',
        items: [
          session({}),
          session({
            id: 's2',
            date: '2026-09-09',
            locked: true,
            teacherId: 't2',
            teacherName: 'Carlos Ruiz Márquez',
          }),
        ],
      },
    ],
    'GET /api/admin/payroll/settlements?month=2026-09': [
      200,
      { month: '2026-09', items: SETTLEMENTS },
    ],
    ...extra,
  });
}

/** Primera celda de cada fila de datos, para comprobar el orden. */
const firstCells = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
/** Nombres enlazados (profesores) de arriba abajo, para comprobar el orden. */
const links = (table: HTMLElement) =>
  within(table)
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('Profesorado', () => {
  it('shows the profitability of each teacher with the month totals', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09');

    const table = await screen.findByRole('table', { name: 'Rentabilidad de septiembre 2026' });
    const lucia = within(table).getByRole('row', { name: /Lucía/ });
    expect(within(lucia).getByText('Más rentable')).toBeInTheDocument();
    // Los totales, al pie de la tabla y cada uno bajo su columna.
    const totals = within(table).getByRole('row', { name: /Totales del mes/ });
    // 14 h; 236 € de coste (16,86 €/h de media); 650 € de ingresos; 414 € de margen (29,57 €/h); 16 de 24 plazas.
    for (const text of ['14 h', '16,86 €/h', '236 €', '650 €', '414 €', '29,57 €', '67 %']) {
      expect(within(totals).getByText(text)).toBeInTheDocument();
    }
    expect(within(totals).getByText('ganancia')).toBeInTheDocument();
    expect(
      within(totals)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([
      'total14 h',
      'media16,86 €/h',
      'en profesores236 €',
      'sin repetir15*',
      'total650 €',
      'total414 €',
      'ganancia29,57 €',
      'media67 %',
    ]);
    expect(within(lucia).getByText('322 €')).toBeInTheDocument();
    expect(within(lucia).getByText('83 %')).toBeInTheDocument();

    // Alumnos: los de cada profesor en su fila; en el total, sin repetir a quien va con los dos.
    // Entre coste e ingresos.
    expect(within(lucia).getAllByRole('cell')[4]).toHaveTextContent('10');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Profesor',
      'Horas',
      'Tarifa',
      'Coste',
      'Alumnos',
      'Ingresos',
      'Margen',
      '€ por hora',
      'Ocupación',
    ]);
    const students = within(totals).getAllByRole('cell')[3] as HTMLElement;
    expect(students).toHaveTextContent('15');
    await userEvent.click(
      within(students).getByRole('button', { name: 'Alumnos con más de un profesor' }),
    );
    const shared = screen.getByRole('dialog', { name: 'Alumnos con más de un profesor' });
    expect(within(shared).getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      expect.stringMatching(/[?&]ficha=s7$/),
    );
    expect(shared).not.toHaveTextContent('Carlos');
    expect(within(lucia).getByText('Más rentable')).toHaveClass('whitespace-nowrap');
  });

  it('records hours for another activity', async () => {
    const fetch = api({ 'POST /api/admin/payroll/sessions': [201, { id: 's9' }] });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar horas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar horas' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Clase'), 'other');
    await userEvent.type(within(dialog).getByLabelText('Actividad'), 'Torneo escolar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Más horas' }));
    expect(within(dialog).getByText('Coste a 16 €/h: 24 €')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar horas' }));

    expect(await screen.findByText('Horas registradas')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/payroll/sessions' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      teacherId: 't1',
      groupId: null,
      activity: 'Torneo escolar',
      hours: 1.5,
    });
  });

  it('records the hours of a club activity, with its teacher and its hours proposed', async () => {
    const fetch = api({
      'GET /api/admin/payroll/duties': [
        200,
        {
          items: [
            {
              id: 'd1',
              teacherId: 't2',
              teacherName: 'Carlos Ruiz Márquez',
              weekday: 5,
              start: '17:00',
              end: '20:00',
              label: 'Viernes',
              kind: 'fridays',
            },
          ],
        },
      ],
      'POST /api/admin/payroll/sessions': [201, { id: 's9' }],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar horas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar horas' });
    const what = within(dialog).getByLabelText('Clase');
    await waitFor(() =>
      expect(
        within(what).getByRole('option', {
          name: 'Viernes · Carlos Ruiz Márquez · Vie 17:00–20:00',
        }),
      ).toBeInTheDocument(),
    );
    await userEvent.selectOptions(what, 'Viernes · Carlos Ruiz Márquez · Vie 17:00–20:00');
    expect(within(dialog).getByLabelText('Profesor')).toHaveValue('t2');
    expect(within(dialog).getByText('3 h')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar horas' }));

    expect(await screen.findByText('Horas registradas')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/payroll/sessions' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      teacherId: 't2',
      groupId: null,
      dutyId: 'd1',
      activity: null,
      hours: 3,
    });
  });

  it('lists sessions, locks paid ones and removes a session after confirming', async () => {
    const fetch = api({ 'DELETE /api/admin/payroll/sessions/s1': [204] });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    const table = await screen.findByRole('table', { name: 'Sesiones de septiembre 2026' });
    const paid = within(table).getByRole('row', { name: /Carlos/ });
    expect(paid).toHaveTextContent('Pagada');
    expect(within(paid).queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument();

    await userEvent.click(
      within(table).getByRole('button', { name: 'Quitar sesión del 07/09/2026' }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/payroll/sessions/s1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('counts once the hours that overlap, explaining it with an asterisk', async () => {
    api({
      'GET /api/admin/payroll/sessions?month=2026-09': [
        200,
        {
          month: '2026-09',
          items: [
            session({
              id: 's3',
              label: 'Viernes',
              minutes: 180,
              countedMinutes: 90,
              costCents: 2400,
              overlapsWith: ['Viernes 17:00'],
            }),
            session({
              id: 's4',
              label: 'Viernes 17:00',
              minutes: 90,
              countedMinutes: 90,
              costCents: 2400,
            }),
          ],
        },
      ],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    const table = await screen.findByRole('table', { name: 'Sesiones de septiembre 2026' });
    const friday = within(table).getByRole('row', { name: /Viernes 1,5 h/ });
    expect(friday).toHaveTextContent('24 €');
    await userEvent.click(within(friday).getByRole('button', { name: 'Por qué cuenta 1,5 h' }));
    const note = await screen.findByRole('dialog', { name: 'Por qué cuenta 1,5 h' });
    expect(note).toHaveTextContent(/Eran 3 h, pero se pisa con Viernes 17:00/);
    // La celda de horas no parte líneas; la nota, sí (que no se salga de la pantalla).
    expect(note).toHaveClass('whitespace-normal');
    // El total, con lo que cuenta: 3 h, no 4,5.
    expect(screen.getByText('2 sesiones · 3 h · 48 €')).toBeInTheDocument();
  });

  it('marks a holiday from the substitutions tab (not the timesheet), removing its sessions', async () => {
    const fetch = api({
      'POST /api/admin/payroll/holidays': [200, { removed: 3 }],
      'GET /api/admin/payroll/substitutions?month=2026-09': [200, { items: [] }],
      'GET /api/admin/payroll/holidays?season=2026': [200, { items: [] }],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');
    await screen.findByRole('table', { name: 'Sesiones de septiembre 2026' });
    expect(screen.queryByRole('button', { name: 'Marcar festivo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Sustituciones y festivos' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir festivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar festivo' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar festivo' }));

    expect(await screen.findByText('Festivo marcado: 3 sesiones quitadas')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/payroll/holidays',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows substitutions and holidays on the calendar and plans a substitution', async () => {
    const fetch = api({
      'GET /api/admin/payroll/substitutions?month=2026-10': [
        200,
        {
          items: [
            {
              id: 's1',
              date: '2026-10-05',
              groupId: 'g1',
              groupName: 'Iniciación A',
              start: '17:00',
              end: '18:00',
              teacherId: 't1',
              teacherName: 'Lucía Moreno Gil',
              substituteId: 't2',
              substituteName: 'Carlos Ruiz Márquez',
              reason: 'Torneo',
            },
          ],
        },
      ],
      'GET /api/admin/payroll/holidays?season=2026': [
        200,
        { items: [{ date: '2026-10-12', name: 'Fiesta Nacional' }] },
      ],
      'POST /api/admin/payroll/substitutions': [201, { id: 's2' }],
    });
    renderApp('/panel/profesores?mes=2026-10&pestana=sustituciones');

    const calendar = await screen.findByRole('table', { name: 'Sustituciones de octubre 2026' });
    expect(
      await within(calendar).findByText('Carlos Ruiz Márquez por Lucía Moreno Gil'),
    ).toBeInTheDocument();
    expect(within(calendar).getByText('Festivo · Fiesta Nacional')).toBeInTheDocument();

    await userEvent.click(
      within(calendar).getByRole('button', { name: 'Nueva sustitución el 07/10/2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Una sola clase' }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Clase o turno'), 'group:g1');
    await userEvent.selectOptions(within(dialog).getByLabelText('La da'), 't2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }));
    await waitFor(() => {
      const call = fetch.mock.calls.find(
        ([u, init]) => u === '/api/admin/payroll/substitutions' && init?.method === 'POST',
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        groupId: 'g1',
        dutyId: null,
        date: '2026-10-07',
        teacherId: 't2',
        reason: null,
      });
    });
  });

  it('highlights today in the calendar of substitutions', async () => {
    const month = currentMonth();
    const season = Number(month.slice(0, 4)) - (month.slice(5) < '09' ? 1 : 0);
    api({
      [`GET /api/admin/payroll/substitutions?month=${month}`]: [200, { month, items: [] }],
      [`GET /api/admin/payroll/holidays?season=${season}`]: [200, { items: [] }],
    });
    renderApp(`/panel/profesores?mes=${month}&pestana=sustituciones`);

    const calendar = await screen.findByRole('table', { name: /^Sustituciones de / });
    const today = todayIso();
    const weekday = new Date(`${today}T12:00:00`).getDay();
    if (weekday === 0 || weekday === 6) {
      expect(within(calendar).queryByRole('cell', { current: 'date' })).not.toBeInTheDocument();
      return;
    }
    expect(within(calendar).getByRole('cell', { current: 'date' })).toHaveTextContent(
      `Hoy, ${Number(today.slice(8))}`,
    );
  });

  it('offers as absent only the teachers with a class or a duty on that day', async () => {
    api({
      'GET /api/admin/payroll/substitutions?month=2026-10': [200, { month: '2026-10', items: [] }],
      'GET /api/admin/payroll/holidays?season=2026': [200, { items: [] }],
      'GET /api/admin/payroll/duties': [
        200,
        {
          items: [
            {
              id: 'd1',
              teacherId: 't2',
              teacherName: 'Carlos Ruiz Márquez',
              weekday: 4,
              start: '17:00',
              end: '20:00',
              label: 'Jueves',
              kind: 'shift',
            },
          ],
        },
      ],
    });
    renderApp('/panel/profesores?mes=2026-10&pestana=sustituciones');
    const calendar = await screen.findByRole('table', { name: 'Sustituciones de octubre 2026' });
    const absentOptions = (dialog: HTMLElement) =>
      within(within(dialog).getByLabelText('Falta'))
        .getAllByRole('option')
        .map((o) => o.textContent);

    // Miércoles: solo Lucía tiene clase.
    await userEvent.click(
      within(calendar).getByRole('button', { name: 'Nueva sustitución el 07/10/2026' }),
    );
    let dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    await waitFor(() =>
      expect(absentOptions(dialog)).toEqual(['Elige a quién se sustituye', 'Lucía Moreno Gil']),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    // Jueves: solo Carlos tiene turno.
    await userEvent.click(
      within(calendar).getByRole('button', { name: 'Nueva sustitución el 08/10/2026' }),
    );
    dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    await waitFor(() =>
      expect(absentOptions(dialog)).toEqual(['Elige a quién se sustituye', 'Carlos Ruiz Márquez']),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    // Viernes: nadie.
    await userEvent.click(
      within(calendar).getByRole('button', { name: 'Nueva sustitución el 09/10/2026' }),
    );
    dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    await waitFor(() =>
      expect(absentOptions(dialog)).toEqual(['Nadie tiene clases ni turnos ese día']),
    );
  });

  it('substitutes a teacher in all their classes of a day by default', async () => {
    const fetch = api({
      'GET /api/admin/payroll/substitutions?month=2026-10': [200, { month: '2026-10', items: [] }],
      'GET /api/admin/payroll/holidays?season=2026': [200, { items: [] }],
      'POST /api/admin/payroll/teacher-substitutions': [201, { created: 2 }],
    });
    renderApp('/panel/profesores?mes=2026-10&pestana=sustituciones');

    const calendar = await screen.findByRole('table', { name: 'Sustituciones de octubre 2026' });
    await userEvent.click(
      within(calendar).getByRole('button', { name: 'Nueva sustitución el 07/10/2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    expect(within(dialog).getByRole('button', { name: 'Un día' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.selectOptions(within(dialog).getByLabelText('Falta'), 't1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Le sustituye'), 't2');
    expect(await within(dialog).findByText(/Se sustituye 1 clase o turno/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Planificar' }));
    await waitFor(() => {
      const call = fetch.mock.calls.find(
        ([u, init]) => u === '/api/admin/payroll/teacher-substitutions' && init?.method === 'POST',
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        teacherId: 't1',
        substituteId: 't2',
        from: '2026-10-07',
        to: '2026-10-07',
        reason: null,
      });
    });
  });

  it('asks for the first and last day only for a long period', async () => {
    api({
      'GET /api/admin/payroll/substitutions?month=2026-10': [200, { month: '2026-10', items: [] }],
      'GET /api/admin/payroll/holidays?season=2026': [200, { items: [] }],
    });
    renderApp('/panel/profesores?mes=2026-10&pestana=sustituciones');

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sustitución' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sustitución' });
    expect(within(dialog).queryByText('Desde')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Periodo largo' }));
    expect(within(dialog).getByText('Desde')).toBeInTheDocument();
    expect(within(dialog).getByText('Hasta')).toBeInTheDocument();
  });

  it('opens the teacher page with balance, months, classes, students and payments', async () => {
    const fetch = api({
      'GET /api/admin/payroll/teachers/t1/report': [
        200,
        {
          teacher: { id: 't1', name: 'Lucía Moreno Gil', rateCents: 1600, active: true },
          season: 2026,
          months: [
            {
              month: '2026-09',
              minutes: 1800,
              amountCents: 48000,
              advancesCents: 0,
              toPayCents: 48000,
              status: 'paid',
              paidOn: '2026-09-30',
              incomeCents: 60000,
              marginCents: 12000,
            },
            {
              month: '2026-10',
              minutes: 600,
              amountCents: 16000,
              advancesCents: 9000,
              toPayCents: 7000,
              status: 'pending',
              paidOn: null,
              incomeCents: 50000,
              marginCents: 2000,
            },
          ],
          balanceCents: 7000,
          payments: [
            {
              id: null,
              date: '2026-09-30',
              kind: 'settlement',
              month: '2026-09',
              amountCents: 48000,
              note: null,
            },
            {
              id: 'a1',
              date: '2026-09-30',
              kind: 'advance',
              month: '2026-10',
              amountCents: 9000,
              note: 'Pago de más',
            },
          ],
          groups: [
            {
              id: 'g1',
              name: 'Iniciación A',
              days: ['mon', 'wed'],
              start: '17:00',
              end: '18:00',
              classroom: 'alfil',
              capacity: 10,
              occupancyByDay: { mon: 6, wed: 4 },
              students: 7,
            },
          ],
          occupancy: { occupied: 10, capacity: 20 },
          students: [{ id: 's1', name: 'Ana Pérez', groups: ['Iniciación A'], weeklyMinutes: 120 }],
          substitutions: [
            {
              date: '2026-10-05',
              label: 'Iniciación A',
              role: 'received',
              otherName: 'Carlos Ruiz Márquez',
              reason: 'Torneo',
            },
          ],
          duties: [],
        },
      ],
      'PUT /api/admin/payroll/settlements/t1/2026-09/payment': [204],
      [`GET /api/admin/payroll/sessions?month=${currentMonth()}&teacherId=t1`]: [
        200,
        { items: [session({ label: 'Martes y jueves 17:00', substitution: true })] },
      ],
    });
    renderApp('/panel/profesores/t1');

    expect(await screen.findByRole('heading', { name: 'Lucía Moreno Gil' })).toBeInTheDocument();
    expect(screen.getByText('Le debemos').parentElement).toHaveTextContent('70 €');
    expect(screen.getByText('Ocupación de sus clases').parentElement).toHaveTextContent('50 %');
    const months = screen.getByRole('table', { name: 'Mes a mes de Lucía Moreno Gil' });
    expect(within(months).getByRole('row', { name: /Octubre 2026/ })).toHaveTextContent('−90 €');
    expect(await screen.findByText('(Sustitución) Martes y jueves 17:00')).toBeInTheDocument();
    const classes = screen.getByRole('table', { name: 'Clases asignadas' });
    expect(within(classes).getByRole('row', { name: /Iniciación A/ })).toHaveTextContent('7 / 10');
    await userEvent.click(
      within(classes).getByRole('button', { name: 'Alumnos por día de Iniciación A' }),
    );
    const byDay = screen.getByRole('dialog', { name: 'Alumnos por día de Iniciación A' });
    expect(byDay).toHaveTextContent('Lunes 17:00: 6 / 10');
    expect(byDay).toHaveTextContent('Miércoles 17:00: 4 / 10');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Alumnos por día/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      expect.stringMatching(/[?&]ficha=s1$/),
    );
    expect(screen.getByText(/le sustituyó Carlos Ruiz Márquez/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Cambiar la fecha de pago de septiembre 2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Fecha de pago' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Día'), '29');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    // Cambiar la fecha de un pago hecho se confirma viendo el cambio.
    const confirm = await screen.findByRole('dialog', { name: '¿Guardar estos cambios?' });
    expect(confirm).toHaveTextContent('Fecha de pago: 30/09/2026 → 29/09/2026');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([u, init]) =>
            u === '/api/admin/payroll/settlements/t1/2026-09/payment' && init?.method === 'PUT',
        ),
      ).toBe(true),
    );
  });

  it('shows on a calendar the hours given each day, its own classes apart from substitutions', async () => {
    const month = currentMonth();
    // Lunes, martes y miércoles de la primera semana entera del mes.
    const monday = [1, 2, 3, 4, 5, 6, 7].find(
      (d) => new Date(`${month}-0${d}T12:00:00`).getDay() === 1,
    ) as number;
    const [first, second, third] = [monday, monday + 1, monday + 2];
    const date = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
    api({
      'GET /api/admin/payroll/teachers/t1/report': [
        200,
        {
          teacher: { id: 't1', name: 'Lucía Moreno Gil', rateCents: 1600, active: true },
          season: 2026,
          months: [],
          balanceCents: 0,
          payments: [],
          groups: [],
          occupancy: { occupied: 0, capacity: 0 },
          students: [],
          substitutions: [],
          duties: [],
        },
      ],
      [`GET /api/admin/payroll/sessions?month=${month}&teacherId=t1`]: [
        200,
        {
          items: [
            session({ id: 's1', date: date(first), minutes: 60, countedMinutes: 60 }),
            // Se pisa media hora con la anterior: ese día cuenta lo que cuenta cada sesión.
            session({ id: 's2', date: date(first), minutes: 90, countedMinutes: 60 }),
            session({ id: 's3', date: date(first), substitution: true, countedMinutes: 90 }),
            session({ id: 's4', date: date(second), substitution: true, countedMinutes: 60 }),
          ],
        },
      ],
    });
    renderApp('/panel/profesores/t1');

    const calendar = await screen.findByRole('table', {
      name: `Calendario de clases dadas en ${monthLabel(month).toLowerCase()}`,
    });
    const day = (n: number) =>
      within(calendar).getByRole('cell', { name: new RegExp(`^Día ${n}(\\D|$)`) });
    await waitFor(() => expect(day(first)).toHaveTextContent('2 h de sus clases'));
    expect(day(first)).toHaveTextContent('1,5 h de sustitución');
    expect(
      within(day(first)).getByText('2 h', { exact: false }).closest('[data-kind]'),
    ).toHaveAttribute('data-kind', 'own');
    expect(day(second)).toHaveTextContent('1 h de sustitución');
    expect(day(second)).not.toHaveTextContent('de sus clases');
    expect(day(second).querySelector('[data-kind="substitution"]')).toHaveClass('bg-ink-strong');
    expect(day(first).querySelector('[data-kind="own"]')).toHaveClass('bg-brand');
    // Un día sin clases dadas (también cuando le sustituyeron) no lleva horas.
    expect(day(third)).not.toHaveTextContent(' h');
    const legend = screen.getByRole('list', { name: 'Leyenda del calendario' });
    expect(legend).toHaveTextContent('Sus clases');
    expect(legend).toHaveTextContent('Sustituciones');
    // Sin clases en fin de semana, el calendario va de lunes a viernes.
    expect(within(calendar).queryByRole('columnheader', { name: 'Sáb' })).not.toBeInTheDocument();
  });

  it('links each teacher name to their page', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09');
    const table = await screen.findByRole('table', { name: 'Rentabilidad de septiembre 2026' });
    expect(within(table).getByRole('link', { name: 'Lucía Moreno Gil' })).toHaveAttribute(
      'href',
      '/panel/profesores/t1',
    );
  });

  it('creates the Friday club activity', async () => {
    const fetch = api({
      'GET /api/admin/payroll/duties': [200, { items: [] }],
      'POST /api/admin/payroll/duties': [201, { id: 'd1' }],
    });
    renderApp('/panel/profesores?pestana=encargado');

    expect(await screen.findByRole('tab', { name: 'Actividades del club' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva actividad' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva actividad' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'fridays');
    expect(within(dialog).getByLabelText('Actividad')).toHaveValue('Viernes');
    await userEvent.selectOptions(within(dialog).getByLabelText('Profesor'), 't2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const call = fetch.mock.calls.find(
        ([u, init]) => u === '/api/admin/payroll/duties' && init?.method === 'POST',
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        teacherId: 't2',
        weekday: 5,
        start: '17:00',
        end: '20:00',
        label: 'Viernes',
        kind: 'fridays',
      });
    });
  });

  it('lets administration add and edit teachers from the team tab', async () => {
    api();
    renderApp('/panel/profesores?pestana=equipo');
    expect(await screen.findByRole('button', { name: 'Añadir profesor' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar Lucía Moreno Gil' }),
    ).toBeInTheDocument();
  });

  it('explains why a settlement cannot be paid', async () => {
    api({
      'POST /api/admin/payroll/settlements/t1/2026-09/payment': [
        409,
        {
          error: {
            code: 'period_closed',
            message: 'Esa fecha pertenece a una temporada cerrada: no se puede modificar.',
          },
        },
      ],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=liquidacion');

    const table = await screen.findByRole('table', { name: 'Liquidación de septiembre 2026' });
    await userEvent.click(
      within(within(table).getByRole('row', { name: /Lucía/ })).getByRole('button', {
        name: 'Marcar como pagada',
      }),
    );

    expect(await screen.findByText(/temporada cerrada/)).toBeInTheDocument();
  });

  it('highlights «Horas» in the mobile bar only on the hours tab', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09&pestana=rentabilidad');

    const mobile = await screen.findByRole('navigation', { name: 'Secciones móvil' });
    expect(within(mobile).getByRole('link', { name: /Horas/ })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the monthly settlements, their detail and pays a pending one', async () => {
    const fetch = api({ 'POST /api/admin/payroll/settlements/t1/2026-09/payment': [204] });
    renderApp('/panel/profesores?mes=2026-09&pestana=liquidacion');

    const table = await screen.findByRole('table', { name: 'Liquidación de septiembre 2026' });
    expect(screen.getByText('236 €')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Carlos/ })).toHaveTextContent(
      'Pagada el 02/10/2026',
    );
    // Editar una liquidación pagada es cosa de superadministración.
    expect(
      within(table).queryByRole('button', { name: /Editar liquidación/ }),
    ).not.toBeInTheDocument();
    const lucia = within(table).getByRole('row', { name: /Lucía/ });
    await userEvent.click(
      within(lucia).getByRole('button', { name: 'Ver detalle de Lucía Moreno Gil' }),
    );
    expect(within(table).getByText('Iniciación A · 8 h')).toBeInTheDocument();
    await userEvent.click(within(lucia).getByRole('button', { name: 'Marcar como pagada' }));

    expect(await screen.findByText('Liquidación de Lucía Moreno Gil pagada')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/payroll/settlements/t1/2026-09/payment',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lets superadministration change the payment date of a paid settlement, after confirming', async () => {
    const fetch = api({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'PUT /api/admin/payroll/settlements/t2/2026-09/payment': [204],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=liquidacion');

    const table = await screen.findByRole('table', { name: 'Liquidación de septiembre 2026' });
    const lucia = within(table).getByRole('row', { name: /Lucía/ });
    expect(
      within(lucia).queryByRole('button', { name: /Editar liquidación/ }),
    ).not.toBeInTheDocument();
    const carlos = within(table).getByRole('row', { name: /Carlos/ });
    await userEvent.click(
      within(carlos).getByRole('button', { name: 'Editar liquidación de Carlos Ruiz Márquez' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Fecha de pago' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Día'), '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('dialog', { name: '¿Guardar estos cambios?' });
    expect(confirm).toHaveTextContent('Fecha de pago: 02/10/2026 → 05/10/2026');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Fecha de pago cambiada')).toBeInTheDocument();
    const call = fetch.mock.calls.find(
      ([url]) => url === '/api/admin/payroll/settlements/t2/2026-09/payment',
    );
    expect(call?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ date: '2026-10-05' });
  });

  it('sorts the sessions from the headers, most recent first unless another column is chosen', async () => {
    api({
      'GET /api/admin/payroll/sessions?month=2026-09': [
        200,
        {
          month: '2026-09',
          items: [
            session({
              id: 's2',
              date: '2026-09-09',
              teacherId: 't2',
              teacherName: 'Carlos Ruiz Márquez',
              label: 'Adultos I',
              minutes: 90,
              countedMinutes: 90,
              costCents: 2700,
            }),
            session({}),
          ],
        },
      ],
    });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');
    const table = await screen.findByRole('table', { name: 'Sesiones de septiembre 2026' });
    const sortBy = (name: string) =>
      userEvent.click(within(table).getByRole('button', { name: `Ordenar por ${name}` }));

    expect(firstCells(table)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy('clase');
    expect(firstCells(table)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy('clase');
    expect(firstCells(table)).toEqual(['07/09/2026', '09/09/2026']);
    await sortBy('profesor');
    expect(firstCells(table)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy('horas');
    expect(firstCells(table)).toEqual(['07/09/2026', '09/09/2026']);
    await sortBy('coste');
    await sortBy('coste');
    expect(firstCells(table)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy('fecha');
    expect(firstCells(table)).toEqual(['07/09/2026', '09/09/2026']);
  });

  it('sorts the settlements from the headers, by teacher unless another column is chosen', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09&pestana=liquidacion');
    const table = await screen.findByRole('table', { name: 'Liquidación de septiembre 2026' });
    const sortBy = (name: string) =>
      userEvent.click(within(table).getByRole('button', { name: `Ordenar por ${name}` }));

    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('horas');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('horas');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('tarifa');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('importe');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('estado');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('estado');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('profesor');
    await sortBy('profesor');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
  });

  it('sorts the club activities from the headers, by day unless another column is chosen', async () => {
    api({
      'GET /api/admin/payroll/duties': [
        200,
        {
          items: [
            {
              id: 'd2',
              teacherId: 't1',
              teacherName: 'Lucía Moreno Gil',
              weekday: 2,
              start: '18:00',
              end: '19:00',
              label: 'Encargado del club',
              kind: 'shift',
            },
            {
              id: 'd1',
              teacherId: 't2',
              teacherName: 'Carlos Ruiz Márquez',
              weekday: 5,
              start: '17:00',
              end: '20:00',
              label: 'Viernes',
              kind: 'fridays',
            },
          ],
        },
      ],
    });
    renderApp('/panel/profesores?pestana=encargado');
    const table = await screen.findByRole('table', { name: 'Actividades del club' });
    const sortBy = (name: string) =>
      userEvent.click(within(table).getByRole('button', { name: `Ordenar por ${name}` }));

    expect(firstCells(table)).toEqual(['Martes', 'Viernes']);
    await sortBy('día');
    expect(firstCells(table)).toEqual(['Viernes', 'Martes']);
    await sortBy('franja');
    expect(firstCells(table)).toEqual(['Viernes', 'Martes']);
    await sortBy('actividad');
    expect(firstCells(table)).toEqual(['Martes', 'Viernes']);
    await sortBy('tipo');
    expect(firstCells(table)).toEqual(['Martes', 'Viernes']);
    await sortBy('encargado');
    expect(firstCells(table)).toEqual(['Viernes', 'Martes']);
    await sortBy('encargado');
    expect(firstCells(table)).toEqual(['Martes', 'Viernes']);
  });

  it('sorts the profitability from the headers, by margin (highest first) unless another column is chosen', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09');
    const table = await screen.findByRole('table', { name: 'Rentabilidad de septiembre 2026' });
    const sortBy = (name: string) =>
      userEvent.click(within(table).getByRole('button', { name: `Ordenar por ${name}` }));

    // Ya no hay botones aparte: se ordena desde las cabeceras.
    expect(screen.queryByRole('group', { name: 'Ordenar por' })).not.toBeInTheDocument();
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('margen');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('profesor');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('profesor');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('horas');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('tarifa');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
    await sortBy('€ por hora');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('ocupación');
    expect(links(table)).toEqual(['Carlos Ruiz Márquez', 'Lucía Moreno Gil']);
    await sortBy('ocupación');
    expect(links(table)).toEqual(['Lucía Moreno Gil', 'Carlos Ruiz Márquez']);
  });

  it('sorts each table of the teacher page from its own headers', async () => {
    api({
      'GET /api/admin/payroll/teachers/t1/report': [
        200,
        {
          teacher: { id: 't1', name: 'Lucía Moreno Gil', rateCents: 1600, active: true },
          season: 2026,
          months: [],
          balanceCents: 0,
          payments: [
            {
              id: 'a1',
              date: '2026-10-05',
              kind: 'advance',
              month: '2026-10',
              amountCents: 9000,
              note: null,
            },
            {
              id: null,
              date: '2026-09-30',
              kind: 'settlement',
              month: '2026-09',
              amountCents: 48000,
              note: null,
            },
          ],
          groups: [
            {
              id: 'g2',
              name: 'Adultos I',
              days: ['tue'],
              start: '16:00',
              end: '17:30',
              classroom: 'caballo',
              capacity: 12,
              occupancyByDay: { tue: 3 },
              students: 3,
            },
            {
              id: 'g1',
              name: 'Iniciación A',
              days: ['mon', 'wed'],
              start: '17:00',
              end: '18:00',
              classroom: 'alfil',
              capacity: 10,
              occupancyByDay: { mon: 6, wed: 4 },
              students: 7,
            },
          ],
          occupancy: { occupied: 13, capacity: 32 },
          students: [
            { id: 's1', name: 'Ana Pérez', groups: ['Iniciación A'], weeklyMinutes: 120 },
            { id: 's2', name: 'Beatriz Soto', groups: ['Adultos I'], weeklyMinutes: 90 },
          ],
          substitutions: [],
          duties: [],
        },
      ],
      [`GET /api/admin/payroll/sessions?month=${currentMonth()}&teacherId=t1`]: [
        200,
        {
          items: [
            session({
              id: 's2',
              date: '2026-09-09',
              label: 'Adultos I',
              minutes: 90,
              costCents: 2700,
            }),
            session({}),
          ],
        },
      ],
    });
    renderApp('/panel/profesores/t1');
    const sortBy = (table: HTMLElement, name: string) =>
      userEvent.click(within(table).getByRole('button', { name: `Ordenar por ${name}` }));

    const sessions = await screen.findByRole('table', { name: /^Clases dadas en / });
    expect(firstCells(sessions)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy(sessions, 'horas');
    expect(firstCells(sessions)).toEqual(['07/09/2026', '09/09/2026']);
    await sortBy(sessions, 'clase o actividad');
    expect(firstCells(sessions)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy(sessions, 'coste');
    await sortBy(sessions, 'coste');
    expect(firstCells(sessions)).toEqual(['09/09/2026', '07/09/2026']);
    await sortBy(sessions, 'fecha');
    expect(firstCells(sessions)).toEqual(['07/09/2026', '09/09/2026']);

    const groups = screen.getByRole('table', { name: 'Clases asignadas' });
    expect(firstCells(groups)).toEqual(['Adultos I', 'Iniciación A']);
    await sortBy(groups, 'clase');
    await sortBy(groups, 'clase');
    expect(firstCells(groups)).toEqual(['Iniciación A', 'Adultos I']);
    await sortBy(groups, 'días');
    expect(firstCells(groups)).toEqual(['Iniciación A', 'Adultos I']);
    await sortBy(groups, 'horario');
    expect(firstCells(groups)).toEqual(['Adultos I', 'Iniciación A']);
    await sortBy(groups, 'aula');
    expect(firstCells(groups)).toEqual(['Iniciación A', 'Adultos I']);
    await sortBy(groups, 'alumnos');
    expect(firstCells(groups)).toEqual(['Adultos I', 'Iniciación A']);
    await sortBy(groups, 'ocupación');
    await sortBy(groups, 'ocupación');
    expect(firstCells(groups)).toEqual(['Iniciación A', 'Adultos I']);

    const students = screen.getByRole('table', { name: 'Alumnos' });
    expect(firstCells(students)).toEqual(['Ana Pérez', 'Beatriz Soto']);
    await sortBy(students, 'horas semanales con él o ella');
    expect(firstCells(students)).toEqual(['Beatriz Soto', 'Ana Pérez']);
    await sortBy(students, 'clases');
    expect(firstCells(students)).toEqual(['Beatriz Soto', 'Ana Pérez']);
    await sortBy(students, 'clases');
    expect(firstCells(students)).toEqual(['Ana Pérez', 'Beatriz Soto']);
    await sortBy(students, 'alumno');
    await sortBy(students, 'alumno');
    expect(firstCells(students)).toEqual(['Beatriz Soto', 'Ana Pérez']);

    const payments = screen.getByRole('table', { name: 'Pagos recibidos' });
    expect(firstCells(payments)).toEqual(['05/10/2026', '30/09/2026']);
    await sortBy(payments, 'importe');
    expect(firstCells(payments)).toEqual(['05/10/2026', '30/09/2026']);
    await sortBy(payments, 'importe');
    expect(firstCells(payments)).toEqual(['30/09/2026', '05/10/2026']);
    await sortBy(payments, 'concepto');
    expect(firstCells(payments)).toEqual(['05/10/2026', '30/09/2026']);
    await sortBy(payments, 'fecha');
    expect(firstCells(payments)).toEqual(['30/09/2026', '05/10/2026']);
  });
});
