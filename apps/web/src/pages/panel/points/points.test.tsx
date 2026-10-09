import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth } from '@/features/billing/money';
import { ADMIN, TEACHER, mockApi, renderApp } from '@/test/render';

const month = currentMonth();
const STUDENTS = [
  {
    id: 's1',
    name: 'Natan Rodriguez Raposo',
    memberNumber: 4,
    points: 1,
    seasonEarned: 2,
    seasonRedeemed: 0,
  },
  {
    id: 's2',
    name: 'Alberto Rodriguez Garcia',
    memberNumber: 20,
    points: 3,
    seasonEarned: 4,
    seasonRedeemed: 5,
  },
];

const bodyOf = (spy: ReturnType<typeof mockApi>, url: string, method: string) =>
  spy.mock.calls.find(([u, init]) => u === url && init?.method === method)?.[1]?.body;

const grid = (pablo: string[]) => ({
  month,
  fridays: [
    { date: '2000-01-07', holiday: null },
    { date: '2000-01-14', holiday: 'Fiesta local' },
    { date: '2999-01-21', holiday: null },
  ],
  students: [
    { id: 's1', name: 'Natan Rodriguez Raposo', memberNumber: 46, present: ['2000-01-07'] },
    { id: 's2', name: 'Pablo Gil Ruiz', memberNumber: null, present: pablo },
  ],
});

describe('Puntos', () => {
  it('lists the students with their points, sorts them and adjusts with a reason', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      [`GET /api/admin/points/students?month=${month}`]: [200, { month, items: STUDENTS }],
      'POST /api/admin/points/adjustments': [204],
    });
    renderApp('/panel/puntos');

    const table = await screen.findByRole('table', { name: /Puntos de/ });
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => (r as HTMLTableRowElement).cells[1]?.textContent);
    expect(names()).toEqual(['Alberto Rodriguez Garcia', 'Natan Rodriguez Raposo']);
    await userEvent.click(screen.getByRole('button', { name: 'Puntos' }));
    expect(names()).toEqual(['Alberto Rodriguez Garcia', 'Natan Rodriguez Raposo']);
    await userEvent.click(screen.getByRole('button', { name: 'Nº de socio' }));
    expect(names()).toEqual(['Natan Rodriguez Raposo', 'Alberto Rodriguez Garcia']);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar alumno' }), 'natan');
    expect(names()).toEqual(['Natan Rodriguez Raposo']);

    await userEvent.click(
      screen.getByRole('button', { name: 'Ajustar los puntos de Natan Rodriguez Raposo' }),
    );
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText(/Puntos/));
    await userEvent.type(within(dialog).getByLabelText(/Puntos/), '-1');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Apuntado por error');
    await userEvent.click(save);
    await waitFor(() =>
      expect(bodyOf(spy, '/api/admin/points/adjustments', 'POST')).toBe(
        JSON.stringify({ studentId: 's1', delta: -1, note: 'Apuntado por error' }),
      ),
    );
  });

  it('marks who came on Fridays, one point each, never in the future or on holidays', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      [`GET /api/admin/points/students?month=${month}`]: [200, { month, items: [] }],
      // Tras marcar, la cuadrícula se vuelve a pedir: ya con Pablo.
      [`GET /api/admin/points/fridays?month=${month}`]: [
        [200, grid([])],
        [200, grid(['2000-01-07'])],
      ],
      'PUT /api/admin/points/fridays/2000-01-07/students/s2': [204],
    });
    renderApp('/panel/puntos?pestana=viernes');

    const pablo = await screen.findByRole('checkbox', {
      name: 'Pablo Gil Ruiz vino el viernes 07/01',
    });
    expect(
      screen.getByRole('checkbox', { name: 'Natan Rodriguez Raposo vino el viernes 07/01' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Pablo Gil Ruiz vino el viernes 14/01' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Pablo Gil Ruiz vino el viernes 21/01' }),
    ).toBeDisabled();
    expect(screen.getByRole('columnheader', { name: /14\/01/ })).toHaveTextContent('Festivo');
    await userEvent.click(pablo);
    expect(pablo).toBeChecked();
    await waitFor(() =>
      expect(bodyOf(spy, '/api/admin/points/fridays/2000-01-07/students/s2', 'PUT')).toBe(
        JSON.stringify({ present: true }),
      ),
    );
    expect(
      await screen.findByRole('checkbox', { name: 'Pablo Gil Ruiz vino el viernes 07/01' }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Solo los que vinieron' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('creates a tournament and marks who sent the photo with the official kit', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      [`GET /api/admin/points/students?month=${month}`]: [200, { month, items: [] }],
      [`GET /api/admin/points/tournaments?month=${month}`]: [
        200,
        {
          items: [
            { id: 't1', name: 'Open de Granada', date: '2026-10-17', pointsPerPhoto: 2, photos: 0 },
          ],
        },
      ],
      'GET /api/admin/points/tournaments/t1': [
        200,
        {
          id: 't1',
          name: 'Open de Granada',
          date: '2026-10-17',
          pointsPerPhoto: 2,
          photos: 0,
          students: [{ id: 's1', name: 'Natan Rodriguez Raposo', memberNumber: 46, sent: false }],
        },
      ],
      'PUT /api/admin/points/tournaments/t1/students/s1': [204],
      'POST /api/admin/points/tournaments': [201, { id: 't2' }],
    });
    renderApp('/panel/puntos?pestana=torneos');

    const list = await screen.findByRole('list', { name: 'Torneos' });
    expect(list).toHaveTextContent('17/10/2026 · 2 puntos por foto · 0 fotos');
    await userEvent.click(within(list).getByRole('button', { name: 'Marcar fotos' }));
    const photos = await screen.findByRole('dialog');
    await userEvent.click(await within(photos).findByRole('checkbox', { name: /Natan/ }));
    await waitFor(() =>
      expect(bodyOf(spy, '/api/admin/points/tournaments/t1/students/s1', 'PUT')).toBe(
        JSON.stringify({ sent: true }),
      ),
    );
    await userEvent.click(within(photos).getByRole('button', { name: 'Cerrar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo torneo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo torneo' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Torneo de Navidad');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        JSON.parse(String(bodyOf(spy, '/api/admin/points/tournaments', 'POST'))),
      ).toMatchObject({
        name: 'Torneo de Navidad',
        pointsPerPhoto: 1,
      }),
    );
  });

  it('is not for teachers', async () => {
    mockApi({ 'GET /api/auth/me': [200, { user: TEACHER }] });
    renderApp('/panel/puntos');
    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeInTheDocument();
  });
});
