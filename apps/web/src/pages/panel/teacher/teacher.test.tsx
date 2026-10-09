import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { todayIso } from '@/features/students/format';
import { currentMonth, shiftMonth } from '@/features/billing/money';
import { addDays, weekOf } from '@/features/teacher-space/dates';
import { TEACHER, mockApi, renderApp } from '@/test/render';

const today = todayIso();
const week = weekOf(today);

const CLASS = {
  date: today,
  groupId: 'g1',
  dutyId: null,
  label: 'Martes y jueves 17:00 · Intermedio · Alfil',
  start: '17:00',
  end: '18:30',
  minutes: 90,
  substitution: false,
  classroom: 'alfil',
  students: 9,
  rollCall: 'open',
};

describe('Mis clases', () => {
  it("lists today's classes and the week day by day, substitutions included", async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      [`GET /api/teacher/classes?from=${today}&to=${today}`]: [200, { items: [CLASS] }],
      [`GET /api/teacher/classes?from=${week.from}&to=${week.to}`]: [
        200,
        {
          items: [
            { ...CLASS, date: week.from },
            {
              ...CLASS,
              date: week.to,
              groupId: 'g9',
              label: 'Adultos I',
              substitution: true,
              students: 1,
            },
          ],
        },
      ],
    });
    renderApp('/panel');

    expect(await screen.findByText('Martes y jueves 17:00 · Intermedio · Alfil')).toBeVisible();
    expect(screen.getByText('Aula Alfil · 9 alumnos')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: 'Pasar lista de Martes y jueves 17:00 · Intermedio · Alfil',
      }),
    ).toHaveAttribute('href', `/panel/lista/g1/${today}`);

    await userEvent.click(screen.getByRole('tab', { name: 'Semana' }));
    const sunday = await screen.findByRole('region', { name: /^Domingo/ });
    expect(within(sunday).getByText('Adultos I')).toBeVisible();
    expect(within(sunday).getByText('Sustitución')).toBeVisible();
    expect(within(sunday).getByText('Aula Alfil · 1 alumno')).toBeVisible();
    expect(screen.getByRole('region', { name: /^Lunes/ })).toBeInTheDocument();
  });
});

describe('Mis alumnos', () => {
  it('shows the students of each class and the days they come when not every day', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/students': [
        200,
        {
          items: [
            {
              groupId: 'g1',
              name: 'Iniciación A',
              days: ['mon', 'wed'],
              start: '17:00',
              end: '18:00',
              classroom: 'alfil',
              students: [
                { id: 's1', name: 'Martina López Herrera', days: ['mon', 'wed'] },
                { id: 's2', name: 'Pablo Gil Ruiz', days: ['mon'] },
              ],
            },
          ],
        },
      ],
    });
    renderApp('/panel/mis-alumnos');

    const group = await screen.findByRole('region', { name: 'Iniciación A' });
    expect(group).toHaveTextContent('Lun, Mié · 17:00–18:00 · Aula Alfil · 2 alumnos');
    expect(within(group).getByText('Pablo Gil Ruiz').closest('li')).toHaveTextContent('Solo Lun');
    expect(within(group).getByText('Martina López Herrera').closest('li')).not.toHaveTextContent(
      'Solo',
    );
  });
});

describe('Pasar lista', () => {
  it('starts with nobody ticked, saves who did not come and goes back to the classes', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/roll-calls/g1/2026-10-13': [
        200,
        {
          ...CLASS,
          date: '2026-10-13',
          students: 2,
          period: 'open',
          list: [
            { id: 's1', name: 'Martina López Herrera', present: false },
            { id: 's2', name: 'Pablo Gil Ruiz', present: false },
          ],
          guests: [],
          others: [{ id: 's9', name: 'Lola Ruiz Pardo' }],
        },
      ],
      'PUT /api/teacher/roll-calls/g1/2026-10-13': [204],
      [`GET /api/teacher/classes?from=${today}&to=${today}`]: [200, { items: [] }],
    });
    renderApp('/panel/lista/g1/2026-10-13');

    // Nadie marcado al abrirla: se marca a quien ha venido (Martina) y Pablo queda como falta.
    expect(await screen.findByText('0 de 2 alumnos · marca a quien ha venido')).toBeVisible();
    const martina = screen.getByRole('checkbox', { name: /Martina López Herrera/ });
    expect(martina).not.toBeChecked();
    await userEvent.click(martina);
    expect(martina).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Pablo Gil Ruiz/ })).not.toBeChecked();
    expect(screen.getByText('1 de 2 alumnos · marca a quien ha venido')).toBeVisible();
    // Asistencia especial: Lola, de otra clase, viene a recuperar.
    await userEvent.click(screen.getByLabelText('Añadir alumno de otra clase'));
    await userEvent.click(await screen.findByRole('option', { name: 'Lola Ruiz Pardo' }));
    expect(screen.getByRole('list', { name: 'Asistencia especial' })).toHaveTextContent(
      'Lola Ruiz Pardo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lista' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.find(
          ([u, init]) => u === '/api/teacher/roll-calls/g1/2026-10-13' && init?.method === 'PUT',
        )?.[1]?.body,
      ).toBe(JSON.stringify({ absent: ['s2'], guests: ['s9'], past: false })),
    );
    expect(await screen.findByRole('heading', { name: 'Mis clases' })).toBeInTheDocument();
  });

  it('changes a past list only after confirming it', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/roll-calls/g1/2026-10-13': [
        200,
        {
          ...CLASS,
          date: '2026-10-13',
          rollCall: 'missed',
          period: 'past',
          list: [{ id: 's1', name: 'Martina López Herrera', present: false }],
          guests: [{ id: 's9', name: 'Lola Ruiz Pardo' }],
          others: [],
        },
      ],
      'PUT /api/teacher/roll-calls/g1/2026-10-13': [204],
      [`GET /api/teacher/classes?from=${today}&to=${today}`]: [200, { items: [] }],
    });
    renderApp('/panel/lista/g1/2026-10-13');
    expect(await screen.findByText(/Es una clase pasada/)).toBeVisible();
    await userEvent.click(screen.getByRole('checkbox', { name: /Martina/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Quitar a Lola Ruiz Pardo de la asistencia especial' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lista' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cambiar una lista pasada' });
    expect(dialog).toHaveTextContent(
      '¿Seguro que quieres cambiar la asistencia de una clase pasada',
    );
    const put = () =>
      spy.mock.calls.find(
        ([u, init]) => u === '/api/teacher/roll-calls/g1/2026-10-13' && init?.method === 'PUT',
      );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(put()).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar lista' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sí, cambiarla' }),
    );
    await waitFor(() =>
      expect(put()?.[1]?.body).toBe(JSON.stringify({ absent: [], guests: [], past: true })),
    );
  });

  it('lists the past classes month by month to see or change their list', async () => {
    const month = shiftMonth(currentMonth(), -1);
    const last = addDays(`${currentMonth()}-01`, -1);
    mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      [`GET /api/teacher/classes?from=${today}&to=${today}`]: [200, { items: [] }],
      [`GET /api/teacher/classes?from=${month}-01&to=${last}`]: [
        200,
        {
          items: [
            { ...CLASS, date: `${month}-06`, rollCall: 'taken' },
            { ...CLASS, date: `${month}-13`, rollCall: 'missed' },
          ],
        },
      ],
    });
    renderApp('/panel');
    await userEvent.click(await screen.findByRole('tab', { name: 'Pasadas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    const links = await screen.findAllByRole('link', { name: /lista de/ });
    // La más reciente primero; sin lista se puede pasar, con lista se corrige.
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Pasar lista', `/panel/lista/g1/${month}-13`],
      ['Corregir', `/panel/lista/g1/${month}-06`],
    ]);
  });
});

describe('Mis pagos', () => {
  it('shows the season totals and each month with its status, latest first', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/pay': [
        200,
        {
          season: 2026,
          months: [
            {
              month: '2026-09',
              minutes: 900,
              amountCents: 22500,
              advancesCents: 0,
              toPayCents: 22500,
              status: 'paid',
              paidOn: '2026-09-30',
            },
            {
              month: '2026-10',
              minutes: 540,
              amountCents: 13500,
              advancesCents: 5000,
              toPayCents: 8500,
              status: 'pending',
              paidOn: null,
            },
          ],
          totals: { minutes: 1440, amountCents: 36000, receivedCents: 27500, owedCents: 8500 },
        },
      ],
    });
    renderApp('/panel/mis-pagos');

    const season = await screen.findByRole('region', { name: 'Temporada' });
    expect(season).toHaveTextContent('Te debemos85 €');
    expect(season).toHaveTextContent('Cobrado275 €');
    expect(season).toHaveTextContent('Horas24 h');
    const months = screen.getByRole('region', { name: 'Mes a mes' });
    const [first, second] = within(months).getAllByRole('heading');
    expect(first).toHaveTextContent('Octubre 2026');
    expect(second).toHaveTextContent('Septiembre 2026');
    expect(months).toHaveTextContent('Pagada el 30/09/2026');
    expect(months).toHaveTextContent('Anticipos−50 €');
  });
});

describe('Actividades del club', () => {
  const activity = (overrides: Record<string, unknown>) => ({
    ...CLASS,
    groupId: null,
    classroom: null,
    students: 0,
    rollCall: 'open',
    ...overrides,
  });

  it('confirms a shift with «Turno hecho» and opens the Friday list of the Friday activity', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      [`GET /api/teacher/classes?from=${today}&to=${today}`]: [
        200,
        {
          items: [
            activity({ dutyId: 'd1', label: 'Viernes', activity: 'fridays', start: '17:00' }),
            activity({
              dutyId: 'd2',
              label: 'Encargado del club',
              activity: 'shift',
              start: '20:00',
            }),
          ],
        },
      ],
      [`POST /api/teacher/activities/d2/${today}/done`]: [204],
    });
    renderApp('/panel');

    expect(await screen.findByRole('link', { name: 'Pasar lista de Viernes' })).toHaveAttribute(
      'href',
      `/panel/viernes/d1/${today}`,
    );
    expect(screen.getByText('Actividad del club · asistencia de los viernes')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Turno hecho: Encargado del club' }));
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([u, init]) =>
            u === `/api/teacher/activities/d2/${today}/done` && init?.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('proposes who came lately, unticked, and adds anyone else by name', async () => {
    const spy = mockApi({
      'GET /api/auth/me': [200, { user: TEACHER }],
      'GET /api/teacher/fridays/d1/2026-10-16': [
        200,
        {
          ...activity({ dutyId: 'd1', label: 'Viernes', activity: 'fridays', date: '2026-10-16' }),
          list: [{ id: 's1', name: 'Natan Rodriguez Raposo', present: false }],
          everyone: [
            { id: 's1', name: 'Natan Rodriguez Raposo' },
            { id: 's2', name: 'Pablo Gil Ruiz' },
          ],
        },
      ],
      'PUT /api/teacher/fridays/d1/2026-10-16/students/s2': [204],
    });
    renderApp('/panel/viernes/d1/2026-10-16');

    const natan = await screen.findByRole('checkbox', { name: /Natan Rodriguez Raposo/ });
    expect(natan).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Pablo Gil Ruiz/ })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Añadir alumno' }), 'pablo');
    await userEvent.click(await screen.findByRole('option', { name: 'Pablo Gil Ruiz' }));
    expect(await screen.findByRole('checkbox', { name: /Pablo Gil Ruiz/ })).toBeChecked();
    await waitFor(() =>
      expect(
        spy.mock.calls.find(
          ([u, init]) =>
            u === '/api/teacher/fridays/d1/2026-10-16/students/s2' && init?.method === 'PUT',
        )?.[1]?.body,
      ).toBe(JSON.stringify({ present: true })),
    );
  });
});
