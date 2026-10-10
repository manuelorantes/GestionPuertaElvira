import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentMonth, monthLabel, shiftMonth } from '@/features/billing/money';
import { ADMIN, mockApi, renderApp } from '@/test/render';

const LEDGER = {
  month: '2026-10',
  incomeCents: 64500,
  expenseCents: 136600,
  expensesByCategory: [
    { category: 'rent', label: 'Alquiler', amountCents: 95000 },
    { category: 'teachers', label: 'Profesores', amountCents: 41600 },
  ],
  items: [
    {
      source: 'manual',
      sourceId: 'e1',
      date: '2026-10-10',
      kind: 'income',
      concept: 'Subvención municipal',
      category: 'grants',
      method: 'transfer',
      amountCents: 60000,
      categoryLabel: 'Subvenciones',
      methodLabel: 'Transferencia',
    },
    {
      source: 'payment',
      sourceId: 'p1',
      date: '2026-10-02',
      kind: 'income',
      concept: 'Octubre 2026 · Martina López Herrera',
      category: 'fees',
      method: 'cash',
      amountCents: 4500,
      studentId: 's1',
      categoryLabel: 'Cuotas',
      methodLabel: 'Efectivo',
    },
    {
      source: 'invoice',
      sourceId: 'i1',
      date: '2026-10-01',
      kind: 'expense',
      concept: 'Propietario del local · Alquiler octubre',
      category: 'rent',
      method: 'transfer',
      amountCents: 95000,
      period: '2026-09',
      categoryLabel: 'Alquiler',
      methodLabel: 'Transferencia',
    },
  ],
};

const INVOICES = [
  {
    id: 'i1',
    date: '2026-10-01',
    number: 'R-2026-10',
    supplier: 'Propietario del local',
    concept: 'Alquiler octubre',
    category: 'rent',
    categoryLabel: 'Alquiler',
    amountCents: 95000,
    paidOn: '2026-10-01',
    method: 'transfer',
    attachmentName: 'alquiler.pdf',
  },
  {
    id: 'i2',
    date: '2026-09-25',
    number: 'TP-044',
    supplier: 'Organización torneo provincial',
    concept: 'Inscripción por equipos',
    category: 'tournaments',
    categoryLabel: 'Torneos',
    amountCents: 12000,
    paidOn: null,
    method: null,
    attachmentName: null,
  },
];

const months = Array.from({ length: 12 }, (_, i) => {
  const month =
    i < 4 ? `2026-${String(9 + i).padStart(2, '0')}` : `2027-${String(i - 3).padStart(2, '0')}`;
  return {
    month,
    incomeCents: i === 1 ? 64500 : 0,
    expenseCents: i === 1 ? 136600 : 0,
    resultCents: i === 1 ? -72100 : 0,
    accumulatedCents: 0,
  };
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/accounting/ledger?month=2026-10': [200, LEDGER],
    'GET /api/admin/accounting/invoices': [200, { items: INVOICES }],
    'GET /api/admin/accounting/years/2026': [
      200,
      {
        startYear: 2026,
        label: '2026/27',
        openingCents: 120000,
        months,
        incomeCents: 64500,
        expenseCents: 136600,
        resultCents: -72100,
        canClose: true,
        closedOn: null,
      },
    ],
    ...extra,
  });
}

describe('Contabilidad', () => {
  it('lists the movements of the month with totals and spending by category', async () => {
    api();
    renderApp('/panel/contabilidad?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Movimientos de octubre 2026' });
    expect(within(table).getByRole('row', { name: /Subvención municipal/ })).toHaveTextContent(
      '+600 €',
    );
    const rent = within(table).getByRole('row', { name: /Alquiler octubre/ });
    expect(rent).toHaveTextContent('−950 €');
    // Pagado en octubre, pero es de septiembre.
    expect(rent).toHaveTextContent('Corresponde a septiembre 2026');
    expect(
      screen.getByText('Ingresos 645 € · Gastos 1366 € · Resultado −721 €'),
    ).toBeInTheDocument();
    const byCategory = screen.getByRole('region', { name: 'Gastos de octubre 2026' });
    expect(within(byCategory).getByText('Alquiler')).toBeInTheDocument();
    expect(within(byCategory).getByText('1366 €')).toBeInTheDocument();
  });

  it('filters the movements by income or payments, and income by payment method', async () => {
    const user = userEvent.setup();
    api();
    renderApp('/panel/contabilidad?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Movimientos de octubre 2026' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const kind = screen.getByRole('group', { name: 'Tipo de movimiento' });
    expect(within(kind).getByRole('button', { name: 'Todo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('group', { name: 'Forma de pago' })).not.toBeInTheDocument();

    await user.click(within(kind).getByRole('button', { name: 'Pagos' }));
    expect(
      within(table).queryByRole('row', { name: /Subvención municipal/ }),
    ).not.toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Alquiler octubre/ })).toBeInTheDocument();
    expect(screen.getByText('1 movimiento · −950 €')).toBeInTheDocument();

    await user.click(within(kind).getByRole('button', { name: 'Ingresos' }));
    const method = screen.getByRole('group', { name: 'Forma de pago' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.click(within(method).getByRole('button', { name: 'Efectivo' }));
    expect(within(table).getByRole('row', { name: /Martina López/ })).toBeInTheDocument();
    expect(
      within(table).queryByRole('row', { name: /Subvención municipal/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 movimiento · +45 €')).toBeInTheDocument();

    await user.click(within(method).getByRole('button', { name: 'Tarjeta' }));
    expect(await screen.findByText('No hay ingresos con tarjeta este mes.')).toBeInTheDocument();
  });

  it('sends automatic movements to the section where they are managed', async () => {
    api();
    renderApp('/panel/contabilidad?mes=2026-10');

    const table = await screen.findByRole('table', { name: 'Movimientos de octubre 2026' });
    const fee = within(table).getByRole('row', { name: /Martina López Herrera/ });
    expect(within(fee).queryByRole('button')).not.toBeInTheDocument();
    expect(within(fee).getByRole('link', { name: /Ir a Cobros/ })).toHaveAttribute(
      'href',
      '/panel/cobros?pestana=registro',
    );
    expect(within(fee).getByRole('link', { name: 'Martina López Herrera' })).toHaveAttribute(
      'href',
      expect.stringMatching(/[?&]ficha=s1$/),
    );
    expect(
      within(table).getByRole('link', { name: /Ir a Facturas: Propietario del local/ }),
    ).toHaveAttribute('href', '/panel/contabilidad?pestana=facturas');
    await userEvent.click(within(fee).getByRole('link', { name: /Ir a Cobros/ }));

    expect(
      await screen.findByRole('tab', { name: 'Cobros registrados', selected: true }),
    ).toBeInTheDocument();
  });

  it('adds a manual expense', async () => {
    const fetch = api({ 'POST /api/admin/accounting/entries': [201, { id: 'e9' }] });
    renderApp('/panel/contabilidad?mes=2026-10');

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir movimiento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir movimiento' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gasto' }));
    await userEvent.type(within(dialog).getByLabelText('Concepto'), 'Comisión del banco');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'other_expenses');
    await userEvent.type(within(dialog).getByLabelText('Importe (€)'), '6');
    // Por defecto, el mes de la fecha; se puede elegir otro.
    const lastMonth = shiftMonth(currentMonth(), -1);
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Mes al que corresponde'),
      lastMonth,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar movimiento' }));

    expect(await screen.findByText('Movimiento añadido')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(([url]) => url === '/api/admin/accounting/entries');
    expect(JSON.parse(String(sent?.[1]?.body))).toMatchObject({
      kind: 'expense',
      concept: 'Comisión del banco',
      category: 'other_expenses',
      amount: '6',
      period: shiftMonth(currentMonth(), -1),
    });
  });

  it('chooses which categories count as of the month', async () => {
    const fetch = api({
      'GET /api/admin/accounting/monthly-categories': [
        200,
        { categories: ['teachers', 'rent', 'fees'] },
      ],
      'PUT /api/admin/accounting/monthly-categories': [204],
    });
    renderApp('/panel/contabilidad?pestana=ajustes');

    const expenses = await screen.findByRole('group', { name: 'Gastos del mes' });
    expect(within(expenses).getByRole('checkbox', { name: 'Profesores' })).toBeChecked();
    expect(within(expenses).getByRole('checkbox', { name: 'Material' })).not.toBeChecked();
    const income = screen.getByRole('group', { name: 'Ingresos del mes' });
    expect(within(income).getByRole('checkbox', { name: 'Cuotas' })).toBeChecked();
    await userEvent.click(within(expenses).getByRole('checkbox', { name: 'Wifi' }));
    await userEvent.click(within(expenses).getByRole('checkbox', { name: 'Alquiler' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Categorías guardadas')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/accounting/monthly-categories' && init?.method === 'PUT',
    );
    expect(JSON.parse(String(sent?.[1]?.body))).toEqual({
      categories: ['teachers', 'internet', 'fees'],
    });
  });

  it('registers a supplier invoice with its document', async () => {
    const fetch = api({
      'POST /api/admin/accounting/invoices': [201, { id: 'i9' }],
      'POST /api/admin/accounting/invoices/i9/payment': [204],
    });
    renderApp('/panel/contabilidad?pestana=facturas');

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir factura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir factura' });
    await userEvent.upload(
      within(dialog).getByLabelText('Documento'),
      new File(['%PDF'], 'relojes.pdf', { type: 'application/pdf' }),
    );
    expect(within(dialog).getByText('relojes.pdf')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Proveedor'), 'Escaque Material Didáctico');
    await userEvent.type(within(dialog).getByLabelText('Concepto'), 'Relojes digitales');
    await userEvent.type(within(dialog).getByLabelText('Importe (€)'), '186');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'material');
    expect(within(dialog).getByLabelText('Mes al que corresponde')).toHaveDisplayValue(
      `El de la factura (${monthLabel(currentMonth()).toLowerCase()})`,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar factura' }));

    expect(await screen.findByText('Factura registrada')).toBeInTheDocument();
    const sent = fetch.mock.calls.find(
      ([url, init]) => url === '/api/admin/accounting/invoices' && init?.method === 'POST',
    );
    const form = sent?.[1]?.body as FormData;
    expect(form.get('supplier')).toBe('Escaque Material Didáctico');
    expect(form.get('period')).toBe('');
    expect((form.get('file') as File).name).toBe('relojes.pdf');
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/accounting/invoices/i9/payment',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not register the invoice twice when retrying a failed payment', async () => {
    const fetch = api({
      'POST /api/admin/accounting/invoices': [201, { id: 'i9' }],
      'POST /api/admin/accounting/invoices/i9/payment': [
        [
          409,
          {
            error: {
              code: 'period_closed',
              message: 'Esa fecha pertenece a una temporada cerrada: no se puede modificar.',
            },
          },
        ],
        [204],
      ],
    });
    renderApp('/panel/contabilidad?pestana=facturas');

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir factura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir factura' });
    await userEvent.type(within(dialog).getByLabelText('Proveedor'), 'Escaque');
    await userEvent.type(within(dialog).getByLabelText('Concepto'), 'Relojes');
    await userEvent.type(within(dialog).getByLabelText('Importe (€)'), '186');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'material');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar factura' }));
    expect(await within(dialog).findByText(/temporada cerrada/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar factura' }));

    expect(await screen.findByText('Factura registrada')).toBeInTheDocument();
    const registrations = fetch.mock.calls.filter(
      ([url, init]) => url === '/api/admin/accounting/invoices' && init?.method === 'POST',
    );
    expect(registrations).toHaveLength(1);
  });

  it('keeps the confirmation open and explains why an entry cannot be removed', async () => {
    api({
      'DELETE /api/admin/accounting/entries/e1': [
        409,
        {
          error: {
            code: 'period_closed',
            message: 'Esa fecha pertenece a una temporada cerrada: no se puede modificar.',
          },
        },
      ],
    });
    renderApp('/panel/contabilidad?mes=2026-10');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Quitar Subvención municipal' }),
    );
    const confirm = await screen.findByRole('dialog', { name: 'Quitar movimiento' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Quitar' }));

    expect(await within(confirm).findByText(/temporada cerrada/)).toBeInTheDocument();
  });

  it('refuses documents that are not a PDF or a photo', async () => {
    api();
    renderApp('/panel/contabilidad?pestana=facturas');

    await userEvent.click(await screen.findByRole('button', { name: 'Añadir factura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir factura' });
    await userEvent.upload(
      within(dialog).getByLabelText('Documento'),
      new File(['x'], 'hoja.xlsx', { type: 'application/vnd.ms-excel' }),
      { applyAccept: false },
    );

    expect(
      within(dialog).getByText('El documento debe ser un PDF o una foto (JPG, PNG o WEBP).'),
    ).toBeInTheDocument();
  });

  it('lists invoices and pays a pending one', async () => {
    const fetch = api({ 'POST /api/admin/accounting/invoices/i2/payment': [204] });
    renderApp('/panel/contabilidad?pestana=facturas');

    const table = await screen.findByRole('table', { name: 'Facturas de proveedores' });
    expect(within(table).getByRole('link', { name: 'Ver documento de R-2026-10' })).toHaveAttribute(
      'href',
      '/api/admin/accounting/invoices/i1/attachment',
    );
    const pending = within(table).getByRole('row', { name: /TP-044/ });
    await userEvent.click(within(pending).getByRole('button', { name: 'Pagar' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Pagar factura' })).getByRole('button', {
        name: 'Marcar como pagada',
      }),
    );

    expect(await screen.findByText('Factura pagada')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/accounting/invoices/i2/payment',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the season month by month and closes it after confirming', async () => {
    const fetch = api({ 'POST /api/admin/accounting/years/2026/closing': [204] });
    renderApp('/panel/contabilidad?pestana=cierre&temporada=2026');

    const table = await screen.findByRole('table', { name: 'Temporada 2026/27 mes a mes' });
    expect(within(table).getByRole('row', { name: /Saldo inicial/ })).toHaveTextContent('1200 €');
    expect(within(table).getByRole('row', { name: /Octubre/ })).toHaveTextContent('−721 €');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar temporada' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cerrar temporada' }),
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/accounting/years/2026/closing',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Temporada 2026/27 cerrada')).toBeInTheDocument();
  });
});
