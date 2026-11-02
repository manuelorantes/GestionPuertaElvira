import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const index = 2026 * 12 + 8 + i; // septiembre 2026 → agosto 2027
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
});

const empty = { income: [], expected: [], expense: [], expectedExpense: [] };

const DETAIL = {
  month: '2026-10',
  months: MONTHS.map((month) =>
    month === '2026-10'
      ? {
          month,
          incomeCents: 6500,
          expectedCents: 2500,
          expenseCents: 55500,
          expectedExpenseCents: 35000,
          parts: {
            income: [
              {
                concept: 'Irene Moreno Salas',
                detail: 'Cuota del mes',
                date: null,
                amountCents: 4500,
                totalCents: null,
              },
              {
                concept: 'Martina López Herrera',
                detail: 'Cuota del mes',
                date: null,
                amountCents: 2000,
                totalCents: 4500,
              },
            ],
            expected: [
              {
                concept: 'Martina López Herrera',
                detail: 'Pagada en parte',
                date: null,
                amountCents: 2500,
                totalCents: 4500,
              },
            ],
            expense: [
              {
                concept: 'Alquiler',
                detail: 'Alquiler',
                date: '2026-10-05',
                amountCents: 51000,
                totalCents: null,
              },
              {
                concept: 'Luz',
                detail: 'Electricidad',
                date: '2026-10-08',
                amountCents: 4500,
                totalCents: 9000,
              },
            ],
            expectedExpense: [
              {
                concept: 'Lucía Moreno Gil',
                detail: 'Previsto según el horario · 18,75 h',
                date: null,
                amountCents: 30000,
                totalCents: null,
              },
              {
                concept: 'Carlos Ruiz Pardo',
                detail: 'Previsto según el horario · 12,5 h',
                date: null,
                amountCents: 20000,
                totalCents: null,
              },
              {
                concept: 'Profesorado ya en el libro',
                detail: 'Lo del profesorado ya pagado este mes',
                date: null,
                amountCents: -15000,
                totalCents: null,
              },
            ],
          },
        }
      : {
          month,
          incomeCents: 0,
          expectedCents: 0,
          expenseCents: 0,
          expectedExpenseCents: 0,
          parts: empty,
        },
  ),
};

function api() {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/dashboard/fees-vs-fixed': [200, DETAIL],
  });
}

describe('Cuotas vs gastos fijos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-15T10:00:00') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists what makes the part chosen in the url, adding up to the bar', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=cierre&mes=2026-10&parte=gastos');

    const detail = await screen.findByRole('region', { name: 'Gastos de octubre 2026' });
    const rows = within(detail).getAllByRole('row');
    // De mayor a menor importe, y el total, el mismo que la barra negra.
    expect(rows[1]).toHaveTextContent('AlquilerAlquiler05/10/2026510,00 €');
    expect(rows[2]).toHaveTextContent('Luz');
    expect(rows[2]).toHaveTextContent('45,00 €de 90,00 €');
    expect(rows.at(-1)).toHaveTextContent('Total555,00 €');
    // Elegida en la gráfica y en la tabla.
    expect(
      screen.getAllByRole('button', { name: 'Gastos de octubre 2026: 555,00 €', pressed: true }),
    ).toHaveLength(2);
  });

  it('changes the detail when another part or figure is chosen, and sorts the table', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=cierre');

    expect(
      await screen.findByText('Pincha una barra o una cifra para ver de qué sale.'),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Cuotas vs gastos fijos mes a mes' });
    // La cifra de la tabla: los gastos previstos, con lo del profesorado ya en el libro descontado.
    await userEvent.click(
      within(table).getByRole('button', { name: 'Gastos previstos de octubre 2026: 350,00 €' }),
    );
    const planned = screen.getByRole('region', { name: 'Gastos previstos de octubre 2026' });
    expect(planned).toHaveTextContent('Lucía Moreno Gil');
    expect(planned).toHaveTextContent('Profesorado ya en el libro');
    expect(planned).toHaveTextContent('−150,00 €');
    expect(within(planned).getAllByRole('row').at(-1)).toHaveTextContent('Total350,00 €');
    // La parte de una barra: las cuotas previstas.
    const chart = screen.getByRole('group', {
      name: /Cuotas vs gastos fijos, de septiembre a agosto/,
    });
    await userEvent.click(
      within(chart).getByRole('button', { name: 'Cuotas previstas de octubre 2026: 25,00 €' }),
    );
    expect(
      screen.getByRole('region', { name: 'Cuotas previstas de octubre 2026' }),
    ).toHaveTextContent('Martina López HerreraPagada en parte');
    // La tabla mes a mes se ordena desde sus cabeceras.
    await userEvent.click(within(table).getByRole('button', { name: /Ordenar por resultado/ }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Octubre 2026');
  });

  it('opens the detail from the bars of the summary', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard': [
        200,
        {
          month: '2026-10',
          today: '2026-10-15',
          balanceCents: 0,
          seasonResultCents: 0,
          pendingCents: 0,
          membershipPendingCents: 0,
          activeStudents: 0,
          studentsChange: 0,
          studentsInClasses: 0,
          inClassesChange: 0,
          cashChart: DETAIL.months.map(({ month, incomeCents, expenseCents }) => ({
            month,
            incomeCents,
            expenseCents,
          })),
          monthChart: DETAIL.months.map((m) => ({
            month: m.month,
            incomeCents: m.incomeCents,
            expectedCents: m.expectedCents,
            expenseCents: m.expenseCents,
            expectedExpenseCents: m.expectedExpenseCents,
          })),
          occupancy: { percent: 0, fullGroups: 0, emptiest: [] },
          overdue: [],
          latest: [],
        },
      ],
      'GET /api/admin/dashboard/fees-vs-fixed': [200, DETAIL],
    });
    renderApp('/panel');

    const chart = await screen.findByRole('group', { name: /Cuotas vs gastos fijos/ });
    await userEvent.click(
      within(chart).getByRole('button', { name: 'Gastos de octubre 2026: 555,00 €' }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Mes a mes y cierre', selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Gastos de octubre 2026' })).toHaveTextContent(
      'Total555,00 €',
    );
  });
});
