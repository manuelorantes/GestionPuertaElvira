import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const MISSED = [
  {
    sessionId: 'p1',
    groupId: 'g2',
    dutyId: null,
    date: '2026-10-06',
    label: 'Martes 19:00',
    teacherName: 'Carlos Ruiz Márquez',
    locked: false,
  },
  // Una actividad del club que su encargado no confirmó.
  {
    sessionId: 'p2',
    groupId: null,
    dutyId: 'd1',
    date: '2026-10-16',
    label: 'Viernes',
    teacherName: 'Ángel Castillo Rodriguez',
    locked: false,
  },
];

describe('Listas sin pasar', () => {
  it('counts them in the menu and lets administration remove a session or keep the class', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/attendance/pending': [
        [200, { items: MISSED }],
        [200, { items: [MISSED[1]] }],
        [200, { items: [] }],
      ],
      'DELETE /api/admin/payroll/sessions/p1': [204],
      'POST /api/admin/attendance/pending/activities/d1/2026-10-16/confirm': [204],
    });
    renderApp('/panel');

    const block = await screen.findByRole('region', { name: 'Listas sin pasar' });
    expect(within(block).getByRole('heading')).toHaveTextContent('Listas sin pasar (2)');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(nav).getByLabelText('2 listas sin pasar')).toBeVisible();

    await userEvent.click(
      within(block).getByRole('button', {
        name: 'Quitar la sesión del 06/10/2026 de Martes 19:00',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Quitar la sesión' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitar sesión' }));
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([u, init]) => u === '/api/admin/payroll/sessions/p1' && init?.method === 'DELETE',
        ),
      ).toBe(true),
    );
    expect(await within(nav).findByLabelText('1 lista sin pasar')).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Dar por buena la clase del 16/10/2026 de Viernes' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Listas sin pasar' })).not.toBeInTheDocument(),
    );
    expect(within(nav).queryByLabelText(/sin pasar/)).not.toBeInTheDocument();
  });
});
