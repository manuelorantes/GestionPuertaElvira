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
  coveredCents: 0,
  fullAmountCents: 4050,
  cancelledCents: 0,
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
  familyPercent: 0,
  hasPrivateLessons: false,
  membershipPaid: false,
  membershipFeeCents: 5000,
  charges: [],
  balanceCents: 0,
};

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/billing/charges?month=2026-10&kind=monthly': [200, OCTOBER],
    'GET /api/admin/billing/charges?month=2026-09&kind=monthly': [
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
  it('offers the whole year only with 9 or 10 months left, charging all of them', async () => {
    const fetch = api({
      'GET /api/admin/billing/accounts/s1': [200, { ...ACCOUNT, remainingMonths: 10 }],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    const year = await within(dialog).findByRole('button', { name: 'Todo el año' });
    await waitFor(() => expect(year).toBeEnabled());
    await userEvent.click(year);
    await waitFor(() => {
      const quotes = fetch.mock.calls.filter(([url]) => url === '/api/admin/billing/quote');
      expect(JSON.parse(String(quotes.at(-1)?.[1]?.body))).toMatchObject({ months: 10 });
    });
  });

  it('disables the whole year when fewer than 9 months are left', async () => {
    api({ 'GET /api/admin/billing/accounts/s1': [200, { ...ACCOUNT, remainingMonths: 8 }] });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Todo el año' })).toBeDisabled(),
    );
    expect(within(dialog).getByRole('button', { name: '6 meses' })).toBeEnabled();
  });

  it('opens a receipt straight from its link', async () => {
    api({ 'GET /api/admin/billing/payments/p9': [200, RECEIPT] });
    renderApp('/panel/cobros?pestana=registro&recibo=p9');

    const receipt = await screen.findByRole('dialog', { name: 'Recibo' });
    expect(await within(receipt).findByText(/R-2026-0002/)).toBeInTheDocument();
  });

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

  it('moves between the months of the season and shows membership fees apart', async () => {
    const fetch = api({
      'GET /api/admin/billing/charges?month=2026-10&kind=membership': [
        200,
        { ...OCTOBER, items: [] },
      ],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const months = await screen.findByRole('group', { name: 'Cuotas a ver' });
    expect(
      within(months)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Cuotas de socio',
      'sep',
      'oct',
      'nov',
      'dic',
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'Cuotas canceladas',
    ]);
    await userEvent.click(within(months).getByRole('button', { name: 'Septiembre 2026' }));
    expect(await screen.findByText('No hay cuotas este mes.')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Cuotas a ver' })).getByRole('button', {
        name: 'Cuotas de socio',
      }),
    );
    expect(await screen.findByText('No hay cuotas de socio esta temporada.')).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([u]) => u === '/api/admin/billing/charges?month=2026-10&kind=membership',
      ),
    ).toBe(true);
  });

  it('shows expected charges of a future month', async () => {
    api({
      'GET /api/admin/billing/charges?month=2026-11&kind=monthly': [
        200,
        {
          ...OCTOBER,
          month: '2026-11',
          items: [
            {
              ...OCTOBER.items[0],
              id: 'prevista-s1-2026-11',
              period: '2026-11',
              status: 'expected',
              paymentId: null,
              receiptNumber: null,
              coveredCents: 0,
            },
          ],
        },
      ],
    });
    renderApp('/panel/cobros?mes=2026-11');

    const row = await screen.findByRole('row', { name: /Prevista/ });
    expect(row).toHaveTextContent('Prevista');
    expect(screen.getByText(/1 previstas/)).toBeInTheDocument();
  });

  it('filters and sorts the charges by status from the status header', async () => {
    api();
    renderApp('/panel/cobros?mes=2026-10');

    const table = await screen.findByRole('table');
    const rowsBefore = within(table).getAllByRole('row').length;
    await userEvent.click(within(table).getByRole('button', { name: /Estado/ }));
    const menu = screen.getByRole('dialog', { name: 'Ordenar y filtrar por estado' });
    const options = within(within(menu).getByRole('group', { name: 'Filtrar' })).getAllByRole(
      'checkbox',
    );
    await userEvent.click(options[0] as HTMLElement);
    expect(within(table).getAllByRole('row').length).toBeLessThan(rowsBefore);
    await userEvent.click(within(menu).getByRole('button', { name: 'Ver todos' }));
    expect(within(table).getAllByRole('row')).toHaveLength(rowsBefore);
    await userEvent.click(within(menu).getByRole('radio', { name: 'Lo cobrado primero' }));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Cobrada');
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

  it('does not quote again when only the payment method changes', async () => {
    const fetch = api();
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Cobrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    expect(await within(dialog).findByText('40,50 €')).toBeInTheDocument();
    const quotesBefore = fetch.mock.calls.filter(
      ([url]) => url === '/api/admin/billing/quote',
    ).length;

    await userEvent.click(within(dialog).getByRole('button', { name: 'Datáfono' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transferencia' }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetch.mock.calls.filter(([url]) => url === '/api/admin/billing/quote')).toHaveLength(
      quotesBefore,
    );
    expect(within(dialog).getByText('40,50 €')).toBeInTheDocument();
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

describe('cuotas canceladas', () => {
  it('cancels a pending charge after confirming it', async () => {
    const spy = api({ 'POST /api/admin/billing/charges/c1/cancel': [204] });
    renderApp('/panel/cobros?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Cuotas de octubre 2026' });
    expect(
      within(table).queryByRole('button', { name: 'Cancelar cuota de Hugo Martín Castillo' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(table).getByRole('button', { name: 'Cancelar cuota de Martina López Herrera' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar cuota' });
    expect(dialog).toHaveTextContent(
      '¿Seguro que quieres cancelar la cuota de octubre de Martina López Herrera (40,50 €)?',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelarla' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([u, init]) => u === '/api/admin/billing/charges/c1/cancel' && init?.method === 'POST',
        ),
      ).toBe(true),
    );
  });

  it('explains a partly cancelled charge and lists the cancelled ones to reactivate them', async () => {
    const spy = api({
      'GET /api/admin/billing/charges?month=2026-10&kind=monthly': [
        200,
        {
          ...OCTOBER,
          items: [
            charge({
              status: 'paid',
              amountCents: 3000,
              fullAmountCents: 4050,
              cancelledCents: 1050,
            }),
          ],
        },
      ],
      'GET /api/admin/billing/charges/cancelled': [
        200,
        {
          items: [
            {
              id: 'c1',
              studentId: 's1',
              studentName: 'Martina López Herrera',
              kind: 'monthly',
              period: '2026-10',
              fullAmountCents: 4050,
              keptCents: 3000,
              cancelledCents: 1050,
              cancelledOn: '2026-10-20',
            },
          ],
        },
      ],
      'POST /api/admin/billing/charges/c1/reactivate': [204],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Cuotas de octubre 2026' });
    expect(
      within(table).getByRole('button', { name: 'Cuota cancelada en parte' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cuotas canceladas' }));
    const list = await screen.findByRole('list', { name: 'Cuotas canceladas' });
    expect(list).toHaveTextContent('Cuota de octubre · cancelada el 20/10/2026');
    expect(list).toHaveTextContent('10,50 €');
    await userEvent.click(within(list).getByRole('button', { name: 'Reactivar' }));

    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([u, init]) =>
            u === '/api/admin/billing/charges/c1/reactivate' && init?.method === 'POST',
        ),
      ).toBe(true),
    );
  });
});
