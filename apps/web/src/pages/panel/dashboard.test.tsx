import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const chart = Array.from({ length: 12 }, (_, i) => {
  const index = 2025 * 12 + 10 + i; // noviembre 2025 → octubre 2026
  const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  return {
    month,
    incomeCents: i === 11 ? 412000 : 500000,
    expenseCents: i === 11 ? 118000 : 300000,
  };
});

const STUDENT = {
  id: 's1',
  memberNumber: 7,
  fullName: 'Irene Moreno Salas',
  birthDate: null,
  age: null,
  nationalId: null,
  contactEmail: null,
  guardians: [],
  ownPhone: null,
  federationLicence: null,
  imageConsent: false,
  missingData: [],
  joinedOn: '2026-09-01',
  withdrawnOn: null,
  status: 'active',
  membership: [{ joinedOn: '2026-09-01', withdrawnOn: null }],
  groups: [],
  siblings: [],
};

const SUMMARY = {
  month: '2026-10',
  today: '2026-10-03',
  collectedCents: 412000,
  expectedCents: 658000,
  pendingCents: 246000,
  membershipPendingCents: 275000,
  expensesCents: 118000,
  activeStudents: 157,
  registeredStudents: 170,
  cashChart: chart,
  // Lo que corresponde a cada mes: solo las categorías del mes.
  monthChart: chart.map((m) => ({ ...m, incomeCents: m.incomeCents - 20000, expenseCents: 90000 })),
  occupancy: {
    percent: 86,
    fullGroups: 3,
    emptiest: [
      {
        id: 'g1',
        name: 'Adultos II',
        teacherName: 'Miguel Á. Fernández',
        occupied: 5,
        capacity: 12,
      },
    ],
  },
  overdue: [
    {
      id: 'c1',
      studentId: 's1',
      studentName: 'Irene Moreno Salas',
      guardianName: 'Inmaculada Salas',
      guardianPhone: '622 34 75 61',
      kind: 'monthly',
      period: '2026-09',
      amountCents: 4500,
      status: 'overdue',
      paymentId: null,
      receiptNumber: null,
      remindedOn: null,
    },
  ],
  latest: [
    {
      source: 'payment',
      sourceId: 'p1',
      date: '2026-10-03',
      kind: 'income',
      concept: 'Octubre 2026 · Sofía Ramírez Vílchez',
      category: 'fees',
      method: 'transfer',
      amountCents: 4500,
      studentId: 's9',
    },
  ],
};

describe('Resumen', () => {
  it('shows the key figures, the chart, occupancy, overdue charges and latest movements', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard': [200, SUMMARY],
    });
    renderApp('/panel');

    expect(await screen.findByText('Cobrado en octubre')).toBeInTheDocument();
    expect(screen.getByText('4120 €')).toBeInTheDocument();
    expect(screen.getByText('de 6580 € previstos')).toBeInTheDocument();
    expect(screen.getByText('2460 €')).toBeInTheDocument();
    // Las cuotas de socio pendientes, aparte de las del mes.
    expect(
      screen.getByText('Plazo hasta el 5 de octubre · y 2750 € de cuotas de socio'),
    ).toBeInTheDocument();
    expect(screen.getByText('157')).toBeInTheDocument();
    // Dos gráficas: lo que entra y sale cada mes, y lo que corresponde a cada mes.
    expect(
      screen.getByRole('img', { name: /Lo que entra y sale cada mes, por fecha/ }),
    ).toHaveAccessibleName(expect.stringContaining('octubre 2026: ingresos 4120 €, gastos 1180 €'));
    expect(screen.getByRole('img', { name: /Lo que corresponde a cada mes/ })).toHaveAccessibleName(
      expect.stringContaining('octubre 2026: ingresos 3920 €, gastos 900 €'),
    );
    await userEvent.hover(screen.getByTestId('caja-2026-10-income'));
    expect(screen.getByText('Ingresos de octubre 2026: 4120 €')).toBeVisible();
    await userEvent.hover(screen.getByTestId('caja-2026-10-expense'));
    expect(screen.getByText('Gastos de octubre 2026: 1180 €')).toBeVisible();
    expect(screen.queryByText('Ingresos de octubre 2026: 4120 €')).not.toBeInTheDocument();
    await userEvent.hover(screen.getByTestId('mes-2026-10-expense'));
    expect(screen.getByText('Gastos de octubre 2026: 900 €')).toBeVisible();
    expect(screen.getByText('86 %')).toBeInTheDocument();
    expect(screen.getByText('3 grupos completos')).toBeInTheDocument();
    expect(screen.getByText('Adultos II')).toBeInTheDocument();
    const overdue = screen.getByRole('region', { name: 'Recibos vencidos' });
    expect(within(overdue).getByRole('link', { name: 'Irene Moreno Salas' })).toHaveAttribute(
      'href',
      '/panel?ficha=s1',
    );
    expect(within(overdue).getByText(/Cuota de septiembre · 45 €/)).toBeInTheDocument();
    const latest = screen.getByRole('region', { name: 'Últimos movimientos' });
    expect(within(latest).getByText('+45 €')).toBeInTheDocument();
    expect(within(latest).getByRole('link', { name: 'Sofía Ramírez Vílchez' })).toHaveAttribute(
      'href',
      '/panel?ficha=s9',
    );
  });

  it("opens a student's sheet over the summary, which stays put, with a way to go to «Alumnos»", async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard': [200, SUMMARY],
      'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
      'GET /api/admin/students/s1': [200, STUDENT],
    });
    renderApp('/panel');

    const overdue = await screen.findByRole('region', { name: 'Recibos vencidos' });
    await user.click(within(overdue).getByRole('link', { name: 'Irene Moreno Salas' }));
    expect(await screen.findByRole('dialog', { name: 'Irene Moreno Salas' })).toBeVisible();
    expect(screen.getByText('Cobrado en octubre')).toBeInTheDocument();

    // Pulsar en la zona gris, fuera del botón, cierra la ficha y se sigue en el resumen.
    await user.click(screen.getByTestId('fondo-ficha'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Cobrado en octubre')).toBeInTheDocument();

    await user.click(within(overdue).getByRole('link', { name: 'Irene Moreno Salas' }));
    await screen.findByRole('dialog', { name: 'Irene Moreno Salas' });
    await user.click(screen.getByRole('link', { name: 'Ir a Alumnos' }));
    expect(await screen.findByRole('heading', { name: 'Alumnos', level: 1 })).toBeVisible();
    expect(await screen.findByRole('dialog', { name: 'Irene Moreno Salas' })).toBeVisible();
  });

  it('opens the payment dialog from an overdue charge', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: ADMIN }],
      'GET /api/admin/dashboard': [200, SUMMARY],
      'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
      'GET /api/admin/billing/accounts/s1': [
        200,
        {
          preferredPlan: 'monthly',
          member: false,
          privateRate: null,
          points: 0,
          suggestedMonths: 1,
          remainingMonths: 9,
        },
      ],
    });
    renderApp('/panel');

    const overdue = await screen.findByRole('region', { name: 'Recibos vencidos' });
    await userEvent.click(within(overdue).getByRole('button', { name: 'Cobrar' }));

    expect(await screen.findByRole('dialog', { name: 'Registrar cobro' })).toBeInTheDocument();
  });
});
