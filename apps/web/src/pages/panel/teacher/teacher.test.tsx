import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { todayIso } from '@/features/students/format';
import { weekOf } from '@/features/teacher-space/dates';
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
