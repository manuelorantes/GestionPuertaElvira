import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
            capacity: 12,
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
            capacity: 12,
          },
        ],
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
    expect(within(lucia).getByText('322 €')).toBeInTheDocument();
    expect(within(lucia).getByText('83 %')).toBeInTheDocument();
    expect(screen.getByText('14 h')).toBeInTheDocument();
    expect(screen.getByText('236 €')).toBeInTheDocument();
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
