import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, SUPERADMIN, mockApi, renderApp } from '@/test/render';

const TASKS = [
  {
    id: 'horas-automaticas',
    name: 'Horas automáticas y cuotas',
    description:
      'Apunta las horas de las clases y turnos del día y crea las cuotas que falten del mes.',
    cron: '30 21 * * *',
    next: '2026-10-09T21:30:00.000Z',
    slots: [
      {
        slot: '2026-10-08T21:30:00.000Z',
        status: 'done',
        delayMinutes: 231,
        startedAt: '2026-10-09T01:20:54.000Z',
        finishedAt: '2026-10-09T01:21:26.000Z',
        url: 'https://github.com/x/actions/runs/1',
      },
      {
        slot: '2026-10-07T21:30:00.000Z',
        status: 'missed',
        delayMinutes: null,
        startedAt: null,
        finishedAt: null,
        url: null,
      },
    ],
    lastRun: {
      startedAt: '2026-10-09T01:20:54.000Z',
      outcome: 'success',
      manual: false,
      url: 'https://github.com/x/actions/runs/1',
    },
  },
  {
    id: 'keep-alive',
    name: 'Mantener activo',
    description: 'Consulta la API para que Supabase no pause el proyecto.',
    cron: '17 6 */3 * *',
    next: '2026-10-10T06:17:00.000Z',
    slots: [
      {
        slot: '2026-10-07T06:17:00.000Z',
        status: 'missed',
        delayMinutes: null,
        startedAt: null,
        finishedAt: null,
        url: null,
      },
    ],
    lastRun: null,
  },
];

describe('Sistema', () => {
  it('shows each scheduled task with its last slot, its history, schedule and next run', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/system/tasks': [200, { items: TASKS }],
    });
    renderApp('/panel/sistema');

    const hours = await screen.findByRole('region', { name: 'Horas automáticas y cuotas' });
    expect(hours).toHaveTextContent('Cada día a las 23:30');
    expect(hours).toHaveTextContent('Siguiente09/10/2026 23:30');
    // Tarde pero bien: «Hecha».
    const slot = within(within(hours).getByRole('list', { name: /^Último turno/ })).getByRole(
      'listitem',
    );
    expect(slot).toHaveTextContent('08/10/2026 23:30');
    expect(slot).toHaveTextContent('Hecha');
    expect(slot).toHaveTextContent('Arrancó a las 03:20 (GitHub la lanzó 3 h 51 min tarde)');
    expect(within(slot).getByRole('link', { name: /Ver en GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/x/actions/runs/1',
    );
    // El resto, en el historial (hasta 15).
    await userEvent.click(within(hours).getByRole('button', { name: 'Ver historial (2 últimos)' }));
    expect(within(hours).getByRole('list', { name: /^Historial/ })).toHaveTextContent('No se hizo');

    const ping = screen.getByRole('region', { name: 'Mantener activo' });
    expect(ping).toHaveTextContent('Cada 3 días a las 08:17');
    expect(ping).toHaveTextContent('No se hizo');
    expect(ping).toHaveTextContent('Ninguna todavía');
    expect(
      within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('link', {
        name: /Sistema/,
      }),
    ).toHaveAttribute('href', '/panel/sistema');
  });

  it('is only for superadministrators', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: ADMIN }] });
    renderApp('/panel/sistema');
    expect(await screen.findByRole('heading', { name: 'Resumen del club' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sistema/ })).not.toBeInTheDocument();
  });
});
