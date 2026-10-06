import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const charge = (overrides: Record<string, unknown>) => ({
  id: 'c1',
  studentId: 's1',
  studentName: 'Martina López Herrera',
  guardianName: 'Rocío Herrera',
  guardianPhone: '612 48 19 30',
  kind: 'monthly',
  period: '2026-10',
  amountCents: 4050,
  status: 'overdue',
  paymentId: null,
  receiptNumber: null,
  remindedOn: null,
  ...overrides,
});

const OCTOBER = {
  month: '2026-10',
  label: 'Octubre 2026',
  items: [
    charge({}),
    charge({
      id: 'c2',
      studentId: 's2',
      studentName: 'Hugo Martín Castillo',
      amountCents: 5500,
      status: 'paid',
      paymentId: 'p1',
      receiptNumber: 'R-2026-0001',
    }),
  ],
  totals: { expectedCents: 9550, collectedCents: 5500, pendingCents: 4050, overdueCount: 1 },
};

const QUOTE = {
  concept: 'Octubre 2026',
  periods: ['2026-10'],
  lines: [
    { label: '2 h semanales · 1 mes', amountCents: 4500 },
    { label: 'Descuento familiar −10 %', amountCents: -450 },
  ],
  grossCents: 4500,
  discountPercent: 10,
  totalCents: 4050,
};

const RECEIPT = {
  id: 'p9',
  receiptNumber: 'R-2026-0002',
  paidOn: '2026-10-03',
  studentId: 's1',
  studentName: 'Martina López Herrera',
  kind: 'monthly',
  concept: 'Octubre 2026',
  method: 'cash',
  totalCents: 4050,
  invoiceNumber: null,
  methodLabel: 'Efectivo',
  guardianName: 'Rocío Herrera',
  lines: QUOTE.lines,
  periods: ['2026-10'],
  invoice: null,
  club: { name: 'Club Ajedrez Puerta Elvira', taxId: 'G18000000', address: 'Granada' },
};

const SETTINGS = {
  threeHours: '55.00',
  twoHours: '45.00',
  hourAndHalf: '40.00',
  oneHour: '35.00',
  membershipFee: '50.00',
  familyPercent: 10,
  threeMonthsPercent: 10,
  sixMonthsPercent: 15,
  seasonPercent: 20,
  defaultPrivateRate: '30.00',
  privateRates: {},
  clubName: 'Club Ajedrez Puerta Elvira',
  clubTaxId: 'G18000000',
  clubAddress: 'Granada',
  vatPercent: 21,
};

const ACCOUNT = {
  preferredPlan: 'monthly',
  member: false,
  privateRate: null,
  points: 2,
  suggestedMonths: 1,
  remainingMonths: 9,
  weeklyHours: 2,
  monthlyFeeCents: 4050,
  familyDiscount: true,
  hasPrivateLessons: false,
  membershipPaid: false,
  membershipFeeCents: 5000,
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/billing/charges?month=2026-10': [200, OCTOBER],
    'GET /api/admin/billing/charges?month=2026-09': [
      200,
      { ...OCTOBER, month: '2026-09', label: 'Septiembre 2026', items: [] },
    ],
    'GET /api/admin/students?filter=active': [
      200,
      {
        items: [
          {
            id: 's1',
            fullName: 'Martina López Herrera',
            age: 12,
            status: 'active',
            groups: [{ id: 'g1', name: 'Intermedio A', slotLabel: 'Lun y Mié · 18:00–19:30' }],
            hasSiblings: true,
          },
        ],
        total: 1,
      },
    ],
    'GET /api/admin/billing/accounts/s1': [200, ACCOUNT],
    'POST /api/admin/billing/quote': [200, QUOTE],
    'GET /api/admin/teachers': [
      200,
      { items: [{ id: 't1', fullName: 'Lucía Moreno Gil', active: true, groupCount: 2 }] },
    ],
    ...extra,
  });
}

describe('Cobros y cuotas', () => {
  it('lists the charges of the month with their status and progress', async () => {
    api();
    renderApp('/panel/cobros?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Cuotas de octubre 2026' });
    const martina = within(table).getByRole('row', { name: /Martina López Herrera/ });
    expect(within(martina).getByText('40,50 €')).toBeInTheDocument();
    expect(within(martina).getByText('Vencida')).toBeInTheDocument();
    expect(within(martina).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Hugo/ })).toHaveTextContent('Cobrada');
    expect(screen.getByText('1 de 2 cuotas cobradas · 55 € de 95,50 €')).toBeInTheDocument();
    expect(screen.getByText('1 vencida')).toBeInTheDocument();
  });

  it('moves between months', async () => {
    api();
    renderApp('/panel/cobros?mes=2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Mes anterior' }));

    expect(await screen.findByText('No hay cuotas este mes.')).toBeInTheDocument();
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument();
  });

  it('registers a payment with a live quote and shows the receipt', async () => {
    const fetch = api({
      'POST /api/admin/billing/payments': [201, { id: 'p9' }],
      'GET /api/admin/billing/payments/p9': [200, RECEIPT],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    expect(await within(dialog).findByText('Descuento familiar −10 %')).toBeInTheDocument();
    expect(within(dialog).getByText('40,50 €')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cobro' }));

    const receipt = await screen.findByRole('dialog', { name: 'Recibo' });
    expect(within(receipt).getByText(/R-2026-0002/)).toBeInTheDocument();
    expect(within(receipt).getByText('Forma de pago: Efectivo')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/billing/payments' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      studentId: 's1',
      kind: 'monthly',
      months: 1,
      method: 'cash',
      redeemPoints: 0,
      specialDiscount: null,
    });
  });

  it('proposes the membership fee for a member without classes', async () => {
    api({
      'GET /api/admin/billing/accounts/s1': [
        200,
        { ...ACCOUNT, weeklyHours: 0, monthlyFeeCents: 0, membershipPaid: false },
      ],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cuota de socio' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('lets administration redeem points and add a fixed special discount with a reason', async () => {
    const fetch = api({
      'GET /api/admin/billing/accounts/s1': [200, { ...ACCOUNT, points: 6 }],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    await userEvent.click(
      await within(dialog).findByRole('switch', {
        name: 'Canjear 5 puntos (−5 % de una cuota mensual)',
      }),
    );
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Descuento especial' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cantidad fija' }));
    await userEvent.type(within(dialog).getByLabelText('Descuento (€)'), '10');
    await userEvent.type(within(dialog).getByLabelText('Motivo del descuento'), 'Beca del club');

    await waitFor(() => {
      const quotes = fetch.mock.calls.filter(([url]) => url === '/api/admin/billing/quote');
      expect(JSON.parse(String(quotes.at(-1)?.[1]?.body))).toMatchObject({
        redeemPoints: 5,
        specialDiscount: { percent: null, amountCents: 1000, concept: 'Beca del club' },
      });
    });
  });

  it('explains why a payment cannot be quoted', async () => {
    api({
      'POST /api/admin/billing/quote': [
        409,
        {
          error: { code: 'beyond_season', message: 'Solo quedan 2 meses de temporada por cobrar.' },
        },
      ],
    });
    renderApp('/panel/cobros?mes=2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar cobro' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Alumno'), 's1');

    expect(
      await within(dialog).findByText('Solo quedan 2 meses de temporada por cobrar.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar cobro' })).toBeDisabled();
  });

  it('prepares a WhatsApp reminder and marks the charge as reminded', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fetch = api({ 'POST /api/admin/billing/charges/c1/reminded': [204] });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'WhatsApp' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aviso por WhatsApp' });
    expect((within(dialog).getByLabelText('Mensaje') as HTMLTextAreaElement).value).toContain(
      'cuota de octubre de Martina (40,50 €)',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir WhatsApp' }));

    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/34612481930?text=Hola%20Roc'),
      '_blank',
      'noopener',
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/billing/charges/c1/reminded',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('lists registered payments and issues an invoice from the receipt', async () => {
    const fetch = api({
      'GET /api/admin/billing/payments': [200, { items: [RECEIPT] }],
      'GET /api/admin/billing/payments/p9': [
        [200, RECEIPT],
        [
          200,
          {
            ...RECEIPT,
            invoiceNumber: 'F-2026-0001',
            invoice: {
              number: 'F-2026-0001',
              issuedOn: '2026-10-03',
              customerName: 'Rocío Herrera',
              customerTaxId: '12345678Z',
              customerAddress: 'Calle Elvira 1',
              vatPercent: 21,
              baseCents: 3347,
              vatCents: 703,
              totalCents: 4050,
            },
          },
        ],
      ],
      'POST /api/admin/billing/payments/p9/invoice': [204],
    });
    renderApp('/panel/cobros?pestana=registro');

    const row = within(await screen.findByRole('table', { name: 'Cobros registrados' })).getByRole(
      'row',
      { name: /R-2026-0002/ },
    );
    await userEvent.click(within(row).getByRole('button', { name: 'Ver recibo' }));
    const receipt = await screen.findByRole('dialog', { name: 'Recibo' });
    await userEvent.click(within(receipt).getByRole('button', { name: 'Emitir factura' }));
    const invoice = await screen.findByRole('dialog', { name: 'Emitir factura' });
    expect(within(invoice).getByLabelText('Nombre o razón social')).toHaveValue('Rocío Herrera');
    await userEvent.type(within(invoice).getByLabelText('NIF'), '12345678Z');
    await userEvent.type(within(invoice).getByLabelText('Dirección'), 'Calle Elvira 1');
    await userEvent.click(within(invoice).getByRole('button', { name: 'Emitir factura' }));

    expect(await screen.findByText('Base imponible')).toBeInTheDocument();
    expect(screen.getByText('33,47 €')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/billing/payments/p9/invoice',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('edits and saves the tariffs', async () => {
    const fetch = api({
      'GET /api/admin/billing/settings': [200, SETTINGS],
      'PUT /api/admin/billing/settings': [204],
    });
    renderApp('/panel/cobros?pestana=tarifas');

    const threeHours = await screen.findByLabelText('3 h o más a la semana');
    await userEvent.clear(threeHours);
    await userEvent.type(threeHours, '60');
    await userEvent.type(screen.getByLabelText('Lucía Moreno Gil'), '32');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(await screen.findByText('Ajustes guardados')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/billing/settings' && init?.method === 'PUT',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      threeHours: '60',
      privateRates: { t1: '32' },
    });
  });
});
