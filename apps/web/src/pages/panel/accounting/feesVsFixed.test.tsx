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
                link: { kind: 'receipt', paymentId: 'p-irene' },
              },
              {
                concept: 'Martina López Herrera',
                detail: 'Cuota del mes',
                date: null,
                amountCents: 2000,
                totalCents: 4500,
                link: { kind: 'fee', studentId: 's-martina', month: '2026-10' },
              },
            ],
            expected: [
              {
                concept: 'Martina López Herrera',
                detail: 'Pagada en parte',
                date: null,
                amountCents: 2500,
                totalCents: 4500,
                link: { kind: 'fee', studentId: 's-martina', month: '2026-10' },
              },
            ],
            expense: [
              {
                concept: 'Alquiler',
                detail: 'Alquiler',
                date: '2026-10-05',
                amountCents: 51000,
                totalCents: null,
                link: { kind: 'movement', sourceId: 'inv-alquiler', month: '2026-10' },
              },
              {
                concept: 'Luz',
                detail: 'Electricidad',
                date: '2026-10-08',
                amountCents: 4500,
                totalCents: 9000,
                link: { kind: 'movement', sourceId: 'e-luz', month: '2026-10' },
              },
            ],
            expectedExpense: [
              {
                concept: 'Lucía Moreno Gil',
                detail: 'Previsto según el horario · 18,75 h',
                date: null,
                amountCents: 30000,
                totalCents: null,
                link: { kind: 'teacher', teacherId: 't-lucia', month: '2026-10' },
              },
              {
                concept: 'Carlos Ruiz Pardo',
                detail: 'Previsto según el horario · 12,5 h',
                date: null,
                amountCents: 20000,
                totalCents: null,
                link: { kind: 'teacher', teacherId: 't-carlos', month: '2026-10' },
              },
              {
                concept: 'Profesorado ya en el libro',
                detail: 'Lo del profesorado ya pagado este mes',
                date: null,
                amountCents: -15000,
                totalCents: null,
                link: { kind: 'ledger', month: '2026-10' },
              },
            ],
          },
        }
      : month === '2026-11'
        ? {
            month,
            incomeCents: 0,
            expectedCents: 0,
            expenseCents: 0,
            expectedExpenseCents: 12000,
            parts: {
              ...empty,
              expectedExpense: [
                {
                  concept: 'Limpieza del local',
                  detail: 'Limpieza · gasto esperado',
                  date: null,
                  amountCents: 12000,
                  totalCents: null,
                  link: { kind: 'expected', expenseId: 'x-limpieza', month: '2026-11' },
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

  it('stops choosing when the empty part of the chart is clicked, and only there', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=cierre&mes=2026-10&parte=gastos');

    const detail = await screen.findByRole('region', { name: 'Gastos de octubre 2026' });
    // Fuera de la gráfica no cambia nada.
    await userEvent.click(screen.getByRole('table', { name: 'Cuotas vs gastos fijos mes a mes' }));
    await userEvent.click(detail);
    expect(screen.getByRole('region', { name: 'Gastos de octubre 2026' })).toBeInTheDocument();
    // En el hueco de la gráfica, fuera de las barras, se deja de elegir.
    const chart = screen.getByRole('group', {
      name: /Cuotas vs gastos fijos, de septiembre a agosto/,
    });
    await userEvent.click(chart);
    expect(
      screen.queryByRole('region', { name: 'Gastos de octubre 2026' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Pincha una barra o una cifra para ver de qué sale.'),
    ).toBeInTheDocument();
    expect(within(chart).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
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

  it('links every line of the detail to where it is shown', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=cierre&mes=2026-10&parte=ingresos');

    const link = async (part: string, name: string) =>
      within(await screen.findByRole('region', { name: part })).getByRole('link', { name });
    expect(
      await link('Ingresos de octubre 2026', 'Irene Moreno Salas: ver el recibo'),
    ).toHaveAttribute('href', '/panel/cobros?recibo=p-irene');
    expect(
      await link(
        'Ingresos de octubre 2026',
        'Martina López Herrera: ver su cuota de octubre 2026 en su ficha',
      ),
    ).toHaveAttribute('href', '/panel/alumnos/s-martina?cuota=2026-10');

    const figures = screen.getByRole('table', { name: 'Cuotas vs gastos fijos mes a mes' });
    const choose = (name: string) => userEvent.click(within(figures).getByRole('button', { name }));
    await choose('Cuotas previstas de octubre 2026: 25,00 €');
    expect(
      await link(
        'Cuotas previstas de octubre 2026',
        'Martina López Herrera: ver su cuota de octubre 2026 en su ficha',
      ),
    ).toHaveAttribute('href', '/panel/alumnos/s-martina?cuota=2026-10');
    await choose('Gastos de octubre 2026: 555,00 €');
    expect(
      await link('Gastos de octubre 2026', 'Luz: ver el movimiento en Movimientos'),
    ).toHaveAttribute(
      'href',
      '/panel/contabilidad?pestana=movimientos&mes=2026-10&movimiento=e-luz',
    );
    await choose('Gastos previstos de octubre 2026: 350,00 €');
    expect(
      await link(
        'Gastos previstos de octubre 2026',
        'Lucía Moreno Gil: ver sus horas y su pago de octubre 2026',
      ),
    ).toHaveAttribute('href', '/panel/profesores/t-lucia?mes=2026-10');
    expect(
      await link(
        'Gastos previstos de octubre 2026',
        'Profesorado ya en el libro: ver los movimientos de octubre 2026',
      ),
    ).toHaveAttribute('href', '/panel/contabilidad?pestana=movimientos&mes=2026-10');
    await choose('Gastos previstos de noviembre 2026: 120,00 €');
    expect(
      await link(
        'Gastos previstos de noviembre 2026',
        'Limpieza del local: ver en los gastos esperados de noviembre 2026',
      ),
    ).toHaveAttribute(
      'href',
      '/panel/contabilidad?pestana=movimientos&mes=2026-11&esperado=x-limpieza',
    );
  });

  it('takes a movement of the detail to its row in Movimientos, spotlighted', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard/fees-vs-fixed': [200, DETAIL],
      'GET /api/admin/accounting/ledger?month=2026-10': [
        200,
        {
          month: '2026-10',
          incomeCents: 0,
          expenseCents: 9000,
          expensesByCategory: [],
          items: [
            {
              source: 'manual',
              sourceId: 'e-luz',
              date: '2026-10-08',
              kind: 'expense',
              concept: 'Luz',
              category: 'electricity',
              method: 'transfer',
              amountCents: 9000,
              categoryLabel: 'Electricidad',
              methodLabel: 'Transferencia',
            },
          ],
        },
      ],
    });
    renderApp('/panel/contabilidad?pestana=cierre&mes=2026-10&parte=gastos');

    const detail = await screen.findByRole('region', { name: 'Gastos de octubre 2026' });
    await userEvent.click(
      within(detail).getByRole('link', { name: 'Luz: ver el movimiento en Movimientos' }),
    );

    const table = await screen.findByRole('table', { name: 'Movimientos de octubre 2026' });
    expect(within(table).getByRole('row', { name: /Luz/ })).toHaveClass('bg-surface-muted');
  });

  it('takes an expected expense of the detail to its line in the expected expenses of the month', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard/fees-vs-fixed': [200, DETAIL],
      'GET /api/admin/accounting/expected/month?month=2026-11': [
        200,
        {
          items: [
            {
              expenseId: 'x-alquiler',
              concept: 'Alquiler',
              category: 'rent',
              categoryLabel: 'Alquiler',
              period: '2026-11',
              expectedCents: 51000,
              status: 'pending',
              paidCents: null,
              entryId: null,
              paidOn: null,
            },
            {
              expenseId: 'x-limpieza',
              concept: 'Limpieza del local',
              category: 'cleaning',
              categoryLabel: 'Limpieza',
              period: '2026-11',
              expectedCents: 12000,
              status: 'pending',
              paidCents: null,
              entryId: null,
              paidOn: null,
            },
          ],
        },
      ],
    });
    renderApp('/panel/contabilidad?pestana=cierre&mes=2026-11&parte=gastos-previstos');

    const detail = await screen.findByRole('region', {
      name: 'Gastos previstos de noviembre 2026',
    });
    await userEvent.click(
      within(detail).getByRole('link', {
        name: 'Limpieza del local: ver en los gastos esperados de noviembre 2026',
      }),
    );

    const card = await screen.findByRole('region', { name: 'Gastos esperados de noviembre 2026' });
    expect(await within(card).findByText('Limpieza del local')).toBeInTheDocument();
    expect(within(card).getByText('Limpieza del local').closest('li')).toHaveClass(
      'bg-surface-muted',
    );
    expect(within(card).getByText('Alquiler').closest('li')).not.toHaveClass('bg-surface-muted');
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
