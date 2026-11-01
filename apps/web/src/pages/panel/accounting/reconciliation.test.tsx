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
      },
    }),
    item(1, {
      kind: 'card_settlement',
      status: 'pending',
      note: 'Faltan 90 € con tarjeta el 10/09/2026: varios cobros completan la cifra, elígelos.',
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
    expect(settlement).toHaveTextContent('Elegido: 40 € de 90 €');
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
    });
  });

  it('is only offered to superadministration', async () => {
    api(ADMIN);
    renderApp('/panel/contabilidad?pestana=conciliacion');
    expect(await screen.findByRole('tab', { name: 'Movimientos' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Conciliación' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Extracto del banco')).not.toBeInTheDocument();
  });
});
