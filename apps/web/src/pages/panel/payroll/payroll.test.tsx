import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth } from '@/features/billing/money';
import { ADMIN, mockApi, renderApp } from '@/test/render';

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

describe('Profesorado', () => {
  it('shows the profitability of each teacher with the month totals', async () => {
    api();
    renderApp('/panel/profesores?mes=2026-09');

    const table = await screen.findByRole('table', { name: 'Rentabilidad de septiembre 2026' });
    const lucia = within(table).getByRole('row', { name: /Lucía/ });
    expect(within(lucia).getByText('Más rentable')).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Totales del mes' });
    // 14 h; 236 € de coste (16,86 €/h de media); 650 € de ingresos; 414 € de margen (29,57 €/h); 16 de 24 plazas.
    for (const text of ['14 h', '16,86 €/h', '236 €', '650 €', '414 €', '29,57 €', '67 %']) {
      expect(within(totals).getByText(text)).toBeInTheDocument();
    }
    expect(within(totals).getByText('Ganancia por hora')).toBeInTheDocument();
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
    const students = within(totals).getByText('Alumnos').nextElementSibling as HTMLElement;
    expect(students).toHaveTextContent('15');
    await userEvent.click(
      within(students).getByRole('button', { name: 'Alumnos con más de un profesor' }),
    );
    const shared = screen.getByRole('dialog', { name: 'Alumnos con más de un profesor' });
    expect(within(shared).getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute(
      'href',
      '/panel/alumnos/s7',
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

  it('lists sessions, locks paid ones and removes a session after confirming', async () => {
    const fetch = api({ 'DELETE /api/admin/payroll/sessions/s1': [204] });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    const table = await screen.findByRole('table', { name: 'Sesiones de septiembre 2026' });
    const paid = within(table).getAllByRole('row')[2];
    expect(paid).toHaveTextContent('Pagada');
    expect(
      within(paid as HTMLElement).queryByRole('button', { name: /Quitar/ }),
    ).not.toBeInTheDocument();

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

  it('marks a holiday removing its sessions', async () => {
    const fetch = api({ 'POST /api/admin/payroll/holidays': [200, { removed: 3 }] });
    renderApp('/panel/profesores?mes=2026-09&pestana=horas');

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar festivo' }));
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
      '/panel/alumnos/s1',
    );
    expect(screen.getByText(/le sustituyó Carlos Ruiz Márquez/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Cambiar la fecha de pago de septiembre 2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Fecha de pago' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([u, init]) =>
            u === '/api/admin/payroll/settlements/t1/2026-09/payment' && init?.method === 'PUT',
        ),
      ).toBe(true),
    );
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

  it('creates a club duty shift', async () => {
    const fetch = api({
      'GET /api/admin/payroll/duties': [200, { items: [] }],
      'POST /api/admin/payroll/duties': [201, { id: 'd1' }],
    });
    renderApp('/panel/profesores?pestana=encargado');

    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo turno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo turno' });
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
        label: 'Encargado del club',
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
});
