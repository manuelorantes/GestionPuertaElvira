import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type * as StatementModule from '@/features/accounting/statement';

import { ADMIN, mockApi, renderApp, SUPERADMIN } from '@/test/render';

const MOVEMENTS = [
  {
    operationDate: '2026-10-22',
    valueDate: '2026-10-22',
    concept: 'Recibo Aguas Del Sur Sa',
    amountCents: -4376,
    balanceCents: 95624,
  },
  {
    operationDate: '2026-09-11',
    valueDate: '2026-09-11',
    concept: 'Liquidacion Efectuada El 10/09/2026',
    amountCents: 9000,
    balanceCents: 100000,
  },
];

vi.mock('@/features/accounting/statement', async (original) => ({
  ...(await original<typeof StatementModule>()),
  readStatement: () => Promise.resolve(MOVEMENTS),
}));

const payment = (id: string, amountCents: number) => ({
  source: 'payment',
  sourceId: id,
  date: '2026-09-03',
  kind: 'income',
  concept: `Cuota · ${id}`,
  category: 'fees',
  method: 'transfer',
  amountCents,
});

const item = (index: number, rest: object) => ({
  key: `k${index}`,
  movement: MOVEMENTS[index],
  matched: [],
  proposal: null,
  candidates: [],
  fixed: [],
  day: MOVEMENTS[index]?.operationDate,
  ...rest,
});

const VIEW = {
  from: '2026-09-11',
  to: '2026-10-22',
  bank: { openingCents: 91000, closingCents: 95624 },
  app: { openingCents: 91000, closingCents: 90000 },
  items: [
    item(0, {
      kind: 'expense',
      status: 'suggested',
      note: 'No hay ningún gasto que le corresponda.',
      proposal: {
        items: [],
        changes: ['Apuntar un gasto de 43,76 € el 22/10/2026'],
        record: {
          kind: 'expense',
          concept: 'Recibo Aguas Del Sur Sa',
          category: 'water',
          method: 'transfer',
        },
        transfer: null,
        fees: [],
        adjust: false,
      },
    }),
    item(1, {
      kind: 'card_settlement',
      status: 'pending',
      note: 'Faltan 90,00 € con tarjeta el 10/09/2026: varios cobros completan la cifra, elígelos.',
      candidates: [payment('p1', 4000), payment('p2', 5000), payment('p3', 9000)],
    }),
  ],
};

const MATCHED = {
  ...VIEW,
  items: VIEW.items.map((i) => ({
    ...i,
    status: 'matched',
    note: 'Casado al conciliar.',
    proposal: null,
  })),
};

const CATEGORIES = [
  { code: 'water', kind: 'expense', label: 'Agua', custom: false },
  { code: 'utilities', kind: 'expense', label: 'Suministros', custom: false },
  { code: 'other_income', kind: 'income', label: 'Otros ingresos', custom: false },
];

function api(user: typeof SUPERADMIN | typeof ADMIN = SUPERADMIN) {
  return mockApi({
    'GET /api/auth/me': [200, { user }],
    'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
    'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
    'POST /api/admin/accounting/reconciliation': [
      [200, VIEW],
      [200, MATCHED],
    ],
    'POST /api/admin/accounting/reconciliation/accept': [204],
    'POST /api/admin/accounting/reconciliation/release': [204],
  });
}

const sentTo = (fetch: ReturnType<typeof api>, path: string) =>
  fetch.mock.calls
    .filter(([url]) => url === path)
    .map(([, init]) => JSON.parse(String(init?.body)));

async function upload() {
  const file = new File(['x'], 'extracto.xlsx');
  await userEvent.upload(await screen.findByLabelText('Extracto del banco'), file);
}

describe('bank reconciliation', () => {
  it('reads a statement, compares the balances and accepts a suggestion after editing it', async () => {
    const fetch = api();
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    expect(
      await screen.findByText('Extracto del 11/09/2026 al 22/10/2026: 2 movimientos.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Diferencia: 56,24/)).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation')[0]).toEqual({
      movements: MOVEMENTS,
    });

    const water = screen.getByText('Recibo Aguas Del Sur Sa').closest('li') as HTMLElement;
    expect(water).toHaveTextContent('Apuntar un gasto de 43,76 € el 22/10/2026');
    const concept = within(water).getByLabelText('Concepto');
    await userEvent.clear(concept);
    await userEvent.type(concept, 'Agua de octubre');
    await userEvent.selectOptions(within(water).getByLabelText('Categoría'), 'utilities');
    await userEvent.click(within(water).getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')).toEqual([
      {
        movement: MOVEMENTS[0],
        items: [],
        record: { concept: 'Agua de octubre', category: 'utilities' },
        transfer: false,
        fees: [],
        adjust: false,
      },
    ]);
    expect(await screen.findByText('Todo cuadra con el banco.')).toBeInTheDocument();
  });

  it('chooses by hand the payments of a card settlement until they add up', async () => {
    const fetch = api();
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const settlement = (await screen.findByText('Liquidacion Efectuada El 10/09/2026')).closest(
      'li',
    ) as HTMLElement;
    const match = within(settlement).getByRole('button', { name: 'Casar con lo elegido' });
    await userEvent.click(within(settlement).getByRole('checkbox', { name: /Cuota · p1/ }));
    expect(settlement).toHaveTextContent('Elegido: 40,00 € de 90,00 €');
    expect(match).toBeDisabled();
    await userEvent.click(within(settlement).getByRole('checkbox', { name: /Cuota · p2/ }));
    await userEvent.click(match);

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toEqual({
      movement: MOVEMENTS[1],
      items: [
        { source: 'payment', sourceId: 'p1' },
        { source: 'payment', sourceId: 'p2' },
      ],
      record: null,
      transfer: false,
      fees: [],
      adjust: false,
    });
  });

  it('charges the fee of a transfer nobody recorded and undoes a match', async () => {
    const transfer = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Rosa Ruiz Duran, Concepto Ana Noviembre',
      amountCents: 5500,
      balanceCents: 105500,
    };
    const fee = {
      ...item(0, {}),
      movement: transfer,
      kind: 'income',
      status: 'suggested',
      note: 'Es la cuota de quien paga, que aún no está cobrada.',
      proposal: {
        items: [],
        changes: [
          'Cobrar a Ana Gil Ruiz «Noviembre 2026» (55,00 €) por transferencia el 03/11/2026',
        ],
        record: null,
        transfer: null,
        fees: [
          {
            studentId: 'ana',
            student: 'Ana Gil Ruiz',
            concept: 'Noviembre 2026',
            amountCents: 5500,
          },
        ],
      },
    };
    const matched = {
      ...fee,
      status: 'matched',
      note: 'Casado al conciliar.',
      matched: [{ ...payment('payment-ana', 5500), date: '2026-11-03' }],
      proposal: null,
    };
    const one = (i: object) => ({ ...VIEW, items: [i] });
    const fetch = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'POST /api/admin/accounting/reconciliation': [
        [200, one(fee)],
        [200, one(matched)],
        [200, one(fee)],
      ],
      'POST /api/admin/accounting/reconciliation/accept': [204],
      'POST /api/admin/accounting/reconciliation/release': [204],
    });
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const row = (await screen.findByText(transfer.concept)).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Cobrar a Ana Gil Ruiz «Noviembre 2026» (55,00 €)');
    await userEvent.click(within(row).getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toMatchObject({
      movement: transfer,
      fees: [{ studentId: 'ana', kind: 'monthly', amountCents: null }],
    });

    await userEvent.click(screen.getByRole('button', { name: /Cuadran/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Casamiento deshecho')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/release')).toEqual([
      { movement: transfer },
    ]);
  });

  it('splits a transfer by hand between a recorded payment and the fee of another student', async () => {
    const transfer = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Marta Ruiz Sol, Concepto Clases',
      amountCents: 10000,
      balanceCents: 110000,
    };
    const pending = {
      ...item(0, {}),
      movement: transfer,
      day: transfer.operationDate,
      kind: 'income',
      status: 'pending',
      note: 'No hay ningún cobro que le corresponda.',
      candidates: [{ ...payment('p1', 5500), date: '2026-11-01' }],
    };
    const fetch = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'GET /api/admin/students?filter=active': [
        200,
        { items: [{ id: 's1', fullName: 'Luis Mora Vela' }], total: 1 },
      ],
      'GET /api/admin/accounting/reconciliation/fee?studentId=s1&day=2026-11-03': [
        200,
        { monthly: { concept: 'Noviembre 2026', amountCents: 4500 }, membership: null },
      ],
      'POST /api/admin/accounting/reconciliation': [
        [200, { ...VIEW, items: [pending] }],
        [200, MATCHED],
      ],
      'POST /api/admin/accounting/reconciliation/accept': [204],
    });
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const row = (await screen.findByText(transfer.concept)).closest('li') as HTMLElement;
    const match = within(row).getByRole('button', { name: 'Casar con lo elegido' });
    await userEvent.click(within(row).getByRole('checkbox', { name: /Cuota · p1/ }));
    expect(match).toBeDisabled();
    await userEvent.type(within(row).getByRole('combobox', { name: 'Alumno' }), 'luis');
    await userEvent.click(await within(row).findByRole('option', { name: 'Luis Mora Vela' }));
    await userEvent.click(
      await within(row).findByRole('button', { name: 'Noviembre 2026 · 45,00 €' }),
    );
    expect(await within(row).findByText('Luis Mora Vela · Noviembre 2026')).toBeInTheDocument();
    expect(row).toHaveTextContent('Elegido: 100,00 € de 100,00 €');
    await userEvent.click(match);

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toEqual({
      movement: transfer,
      items: [{ source: 'payment', sourceId: 'p1' }],
      record: null,
      transfer: false,
      fees: [{ studentId: 's1', kind: 'monthly', amountCents: null }],
      adjust: false,
    });
  });

  it('confirms charging two fees when the transfer brings more, leaving it in their favour', async () => {
    const transfer = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Luis Porras Wadley, Concepto Mensualidad',
      amountCents: 8000,
      balanceCents: 108000,
    };
    const pending = {
      ...item(0, {}),
      movement: transfer,
      day: transfer.operationDate,
      kind: 'income',
      status: 'pending',
      note: 'No hay ningún cobro ni ingreso que le corresponda.',
    };
    const quote = (id: string) =>
      `GET /api/admin/accounting/reconciliation/fee?studentId=${id}&day=2026-11-03`;
    const fetch = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'GET /api/admin/students?filter=active': [
        200,
        {
          items: [
            { id: 'a', fullName: 'Andres Porras Romero' },
            { id: 'l', fullName: 'Luis Porras Wadley' },
          ],
          total: 2,
        },
      ],
      [quote('a')]: [
        200,
        { monthly: { concept: 'Noviembre 2026', amountCents: 3200 }, membership: null },
      ],
      [quote('l')]: [
        200,
        { monthly: { concept: 'Noviembre 2026', amountCents: 3200 }, membership: null },
      ],
      'POST /api/admin/accounting/reconciliation': [
        [200, { ...VIEW, items: [pending] }],
        [200, MATCHED],
      ],
      'POST /api/admin/accounting/reconciliation/accept': [204],
    });
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const row = (await screen.findByText(transfer.concept)).closest('li') as HTMLElement;
    for (const name of ['Andres Porras Romero', 'Luis Porras Wadley']) {
      await userEvent.type(within(row).getByRole('combobox', { name: 'Alumno' }), name.slice(0, 5));
      await userEvent.click(await within(row).findByRole('option', { name }));
      await userEvent.click(
        await within(row).findByRole('button', { name: 'Noviembre 2026 · 32,00 €' }),
      );
      await within(row).findByText(`${name} · Noviembre 2026`);
    }
    expect(row).toHaveTextContent(
      'Elegido: 64,00 € de 80,00 € · 16,00 € de más: quedará a su favor',
    );
    await userEvent.click(within(row).getByRole('button', { name: 'Casar con lo elegido' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('¿Cobrar con saldo a favor?');
    expect(dialog).toHaveTextContent('Los 16,00 € de más se reparten a partes iguales');
    expect(within(dialog).getAllByText('8,00 € a su favor')).toHaveLength(2);
    expect(within(dialog).getAllByText('40,00 €')).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cobrar así' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toEqual({
      movement: transfer,
      items: [],
      record: null,
      transfer: false,
      fees: [
        { studentId: 'a', kind: 'monthly', amountCents: null },
        { studentId: 'l', kind: 'monthly', amountCents: null },
      ],
      adjust: true,
    });
  });

  it('records by hand an income for a card settlement nothing matches', async () => {
    const fetch = api();
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const settlement = (await screen.findByText('Liquidacion Efectuada El 10/09/2026')).closest(
      'li',
    ) as HTMLElement;
    expect(within(settlement).getByRole('combobox', { name: 'Alumno' })).toBeInTheDocument();
    await userEvent.click(within(settlement).getByRole('button', { name: 'Crear un ingreso' }));
    const concept = within(settlement).getByLabelText('Concepto');
    await userEvent.clear(concept);
    await userEvent.type(concept, 'Venta de libros');
    await userEvent.click(within(settlement).getByRole('button', { name: 'Apuntar' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toMatchObject({
      movement: MOVEMENTS[1],
      items: [],
      record: { concept: 'Venta de libros' },
      fees: [],
    });
  });

  it('charges a provisional member the membership fee and the rest on account', async () => {
    const transfer = {
      operationDate: '2026-11-03',
      valueDate: '2026-11-03',
      concept: 'Transferencia De Alvaro Tejero Gilabert, Concepto Socio',
      amountCents: 8000,
      balanceCents: 108000,
    };
    const pending = {
      ...item(0, {}),
      movement: transfer,
      day: transfer.operationDate,
      kind: 'income',
      status: 'pending',
      note: 'No hay ningún cobro ni ingreso que le corresponda.',
    };
    const fetch = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'GET /api/admin/students?filter=active': [200, { items: [], total: 0 }],
      'GET /api/admin/students?filter=provisional': [
        200,
        { items: [{ id: 'p', fullName: 'Alvaro Tejero Gilabert' }], total: 1 },
      ],
      'GET /api/admin/accounting/reconciliation/fee?studentId=p&day=2026-11-03': [
        200,
        { monthly: null, membership: { concept: 'Cuota de socio 2026/27', amountCents: 5000 } },
      ],
      'POST /api/admin/accounting/reconciliation': [
        [200, { ...VIEW, items: [pending] }],
        [200, MATCHED],
      ],
      'POST /api/admin/accounting/reconciliation/accept': [204],
    });
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const row = (await screen.findByText(transfer.concept)).closest('li') as HTMLElement;
    const pick = async () => {
      await userEvent.type(within(row).getByRole('combobox', { name: 'Alumno' }), 'alvaro');
      await userEvent.click(
        await within(row).findByRole('option', { name: 'Alvaro Tejero Gilabert (provisional)' }),
      );
    };
    await pick();
    await userEvent.click(
      await within(row).findByRole('button', { name: 'Cuota de socio 2026/27 · 50,00 €' }),
    );
    await pick();
    expect(await within(row).findByLabelText('A cuenta (€)')).toHaveValue('30');
    await userEvent.click(within(row).getByRole('button', { name: 'Añadir a cuenta' }));
    expect(row).toHaveTextContent('Alvaro Tejero Gilabert (provisional) · Pago a cuenta');
    expect(row).toHaveTextContent('Elegido: 80,00 € de 80,00 €');
    await userEvent.click(within(row).getByRole('button', { name: 'Casar con lo elegido' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toMatchObject({
      fees: [
        { studentId: 'p', kind: 'membership', amountCents: null },
        { studentId: 'p', kind: 'credit', amountCents: 3000 },
      ],
      adjust: false,
    });
  });

  it('lets untick what a card settlement already counted', async () => {
    const settlement = {
      ...item(1, {}),
      kind: 'card_settlement',
      status: 'pending',
      note: 'En la app hay 31,00 € más con tarjeta el 10/09/2026 de lo que abonó el banco.',
      fixed: [payment('p1', 9000), payment('p2', 3100)].map((p) => ({ ...p, method: 'card' })),
    };
    const fetch = mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'POST /api/admin/accounting/reconciliation': [
        [200, { ...VIEW, items: [settlement] }],
        [200, MATCHED],
      ],
      'POST /api/admin/accounting/reconciliation/accept': [204],
    });
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const row = (await screen.findByText('Liquidacion Efectuada El 10/09/2026')).closest(
      'li',
    ) as HTMLElement;
    expect(row).toHaveTextContent('Elegido: 121,00 € de 90,00 €');
    await userEvent.click(within(row).getByRole('checkbox', { name: /Cuota · p2/ }));
    await userEvent.click(within(row).getByRole('button', { name: 'Casar con lo elegido' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toMatchObject({
      items: [{ source: 'payment', sourceId: 'p1' }],
    });
  });

  it('completes the payments of a settlement with a new income for the rest', async () => {
    const fetch = api();
    renderApp('/panel/contabilidad?pestana=conciliacion');
    await upload();

    const settlement = (await screen.findByText('Liquidacion Efectuada El 10/09/2026')).closest(
      'li',
    ) as HTMLElement;
    await userEvent.click(within(settlement).getByRole('checkbox', { name: /Cuota · p2/ }));
    await userEvent.click(
      within(settlement).getByRole('checkbox', { name: /Apuntar lo que falta \(40,00 €\)/ }),
    );
    expect(settlement).toHaveTextContent('40,00 € se apuntará como un ingreso nuevo');
    const concept = within(settlement).getByLabelText('Concepto');
    await userEvent.clear(concept);
    await userEvent.type(concept, 'Venta de libros');
    await userEvent.click(within(settlement).getByRole('button', { name: 'Casar con lo elegido' }));

    expect(await screen.findByText('Movimiento conciliado')).toBeInTheDocument();
    expect(sentTo(fetch, '/api/admin/accounting/reconciliation/accept')[0]).toEqual({
      movement: MOVEMENTS[1],
      items: [{ source: 'payment', sourceId: 'p2' }],
      record: { concept: 'Venta de libros', category: 'other_income' },
      transfer: false,
      fees: [],
      adjust: false,
    });
  });

  it('shows under the balances what is left to reconcile in the app and in the bank', async () => {
    mockApi({
      'GET /api/auth/me': [200, { user: SUPERADMIN }],
      'GET /api/admin/accounting/balances': [200, { clubCents: 0, bankCents: 0, cashCents: 0 }],
      'GET /api/admin/accounting/categories': [200, { items: CATEGORIES }],
      'GET /api/admin/accounting/reconciliation/pending': [
        200,
        {
          app: {
            totalCents: 1800,
            items: [
              {
                source: 'payment',
                sourceId: 'p2',
                date: '2026-10-02',
                concept: 'Octubre · Ana',
                method: 'transfer',
                amountCents: 3000,
              },
              {
                source: 'manual',
                sourceId: 'e1',
                date: '2026-10-05',
                concept: 'Cuerdas',
                method: 'card',
                amountCents: -1200,
              },
            ],
          },
          bank: {
            totalCents: 700,
            items: [{ ...MOVEMENTS[0], concept: 'Transferencia De Quien Sea', amountCents: 700 }],
          },
        },
      ],
    });
    renderApp('/panel/contabilidad');

    expect(await screen.findByText('En la app sin conciliar')).toBeInTheDocument();
    expect(await screen.findByText('18,00 €')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2 sin conciliar' }));
    expect(screen.getByText('Cuerdas')).toBeInTheDocument();
    expect(screen.getByText(/^.12,00 €$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '1 sin conciliar' }));
    expect(screen.getByText('Transferencia De Quien Sea')).toBeInTheDocument();
  });

  it('does not show what is left to reconcile to administration', async () => {
    api(ADMIN);
    renderApp('/panel/contabilidad');
    expect(await screen.findByText('Saldo en caja')).toBeInTheDocument();
    expect(screen.queryByText('En la app sin conciliar')).not.toBeInTheDocument();
  });

  it('is only offered to superadministration', async () => {
    api(ADMIN);
    renderApp('/panel/contabilidad?pestana=conciliacion');
    expect(await screen.findByRole('tab', { name: 'Movimientos' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Conciliación' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Extracto del banco')).not.toBeInTheDocument();
  });
});
