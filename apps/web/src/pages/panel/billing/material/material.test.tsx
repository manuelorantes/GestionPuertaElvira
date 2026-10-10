import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ADMIN, mockApi, renderApp } from '@/test/render';

const TRACKSUIT = {
  id: 'p1',
  name: 'Chándal',
  priceCents: 4500,
  active: true,
  fields: [
    { id: 'talla', name: 'Talla', kind: 'options', options: ['8', '10', '12'] },
    { id: 'nombre', name: 'Nombre a estampar', kind: 'text', options: [] },
  ],
};

const order = (overrides: Record<string, unknown>) => ({
  id: 'o1',
  studentId: 's1',
  studentName: 'Martina López Herrera',
  productId: 'p1',
  productName: 'Chándal',
  quantity: 1,
  values: { talla: '10' },
  detail: 'Talla 10',
  variantLabel: 'Talla 10',
  missing: [],
  note: null,
  status: 'reserved',
  priceCents: null,
  dueCents: 0,
  coveredCents: 0,
  chargeId: null,
  createdOn: '2026-10-08',
  orderedOn: null,
  deliveredOn: null,
  cancelledOn: null,
  returnedToStock: false,
  ...overrides,
});

const ORDERS = [
  order({}),
  order({
    id: 'o2',
    studentId: 's2',
    studentName: 'Hugo Martín Castillo',
    quantity: 2,
    detail: 'Talla 12 · Nombre a estampar: Hugo',
    status: 'ordered',
    priceCents: 9000,
    dueCents: 9000,
    coveredCents: 2000,
    chargeId: 'c2',
    deliveredOn: '2026-10-09',
  }),
];

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/auth/me': [200, { user: ADMIN }],
    'GET /api/admin/equipment/products': [200, { items: [TRACKSUIT] }],
    'GET /api/admin/equipment/orders?open=1': [200, { items: ORDERS }],
    'GET /api/admin/students?filter=active': [
      200,
      {
        items: [
          {
            id: 's1',
            fullName: 'Martina López Herrera',
            age: 12,
            status: 'active',
            groups: [],
            hasSiblings: false,
          },
        ],
        total: 1,
      },
    ],
    ...extra,
  });
}

const bodyOf = (spy: ReturnType<typeof api>, method: string, url: string) =>
  JSON.parse(
    String(spy.mock.calls.find(([u, init]) => u === url && init?.method === method)?.[1]?.body),
  ) as unknown;

describe('Material deportivo', () => {
  it('lists the open orders with their state, delivery and the actions each one allows', async () => {
    api();
    renderApp('/panel/cobros?pestana=material');

    const list = await screen.findByRole('list', { name: 'Pedidos de material' });
    const [martina, hugo] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(martina).toHaveTextContent('Chándal · Talla 10');
    expect(martina).toHaveTextContent('Sin precio');
    expect(within(martina).getByText('Reservado')).toBeInTheDocument();
    expect(within(martina).getByRole('button', { name: 'Pasar a pedido' })).toBeInTheDocument();
    expect(hugo).toHaveTextContent('2 × Chándal · Talla 12 · Nombre a estampar: Hugo');
    expect(hugo).toHaveTextContent('Faltan 70 €');
    expect(within(hugo).getByText('Entregado 09/10/2026')).toBeInTheDocument();
    expect(within(hugo).getByRole('button', { name: 'Cobrar' })).toBeInTheDocument();
    // Con algo cobrado ya no se cambia el precio; entregado, ya no se corrige.
    expect(within(hugo).queryByRole('button', { name: /Cambiar el precio/ })).toBeNull();
    expect(within(hugo).queryByRole('button', { name: /^Corregir/ })).toBeNull();
    expect(within(hugo).getByRole('button', { name: /Deshacer la entrega/ })).toBeInTheDocument();
  });

  it('turns a reservation into an order proposing the product price', async () => {
    const spy = api({ 'POST /api/admin/equipment/orders/o1/place': [204] });
    renderApp('/panel/cobros?pestana=material');

    const list = await screen.findByRole('list', { name: 'Pedidos de material' });
    await userEvent.click(within(list).getByRole('button', { name: 'Pasar a pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pasar a pedido' });
    expect(within(dialog).getByLabelText('Precio total (€)')).toHaveValue('45');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pasar a pedido' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/orders/o1/place')).toEqual({
        priceCents: 4500,
      }),
    );
  });

  it('asks for the size still to choose before turning a reservation into an order', async () => {
    const spy = api({
      'GET /api/admin/equipment/orders?open=1': [
        200,
        { items: [order({ values: {}, detail: '', variantLabel: '', missing: ['Talla'] })] },
      ],
      'PUT /api/admin/equipment/orders/o1': [204],
      'POST /api/admin/equipment/orders/o1/place': [204],
    });
    renderApp('/panel/cobros?pestana=material');

    const list = await screen.findByRole('list', { name: 'Pedidos de material' });
    expect(within(list).getByText('Falta talla')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Pasar a pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pasar a pedido' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pasar a pedido' }));
    expect(
      await within(dialog).findByText('Antes de pasarlo a pedido, elige talla.'),
    ).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText('Talla'), '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pasar a pedido' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/orders/o1/place')).toEqual({
        priceCents: 4500,
      }),
    );
    expect(bodyOf(spy, 'PUT', '/api/admin/equipment/orders/o1')).toEqual({
      quantity: 1,
      values: { talla: '12' },
      note: null,
    });
  });

  it('reserves an order with the size still to choose', async () => {
    const spy = api({ 'POST /api/admin/equipment/orders': [201, { id: 'o3' }] });
    renderApp('/panel/cobros?pestana=material');

    await userEvent.click(await screen.findByRole('button', { name: 'Apuntar pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apuntar pedido' });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Alumno' }), 'martina');
    await userEvent.click(
      await within(dialog).findByRole('option', { name: 'Martina López Herrera' }),
    );
    await userEvent.selectOptions(within(dialog).getByLabelText('Producto'), 'p1');
    expect(within(dialog).getByLabelText('Talla')).toHaveDisplayValue('Sin elegir aún');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apuntar reserva' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/orders')).toMatchObject({ values: {} }),
    );
  });

  it('notes a new order choosing the student, the product and its fields', async () => {
    const spy = api({ 'POST /api/admin/equipment/orders': [201, { id: 'o3' }] });
    renderApp('/panel/cobros?pestana=material');

    await userEvent.click(await screen.findByRole('button', { name: 'Apuntar pedido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Apuntar pedido' });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Alumno' }), 'martina');
    await userEvent.click(
      await within(dialog).findByRole('option', { name: 'Martina López Herrera' }),
    );
    await userEvent.selectOptions(within(dialog).getByLabelText('Producto'), 'p1');
    await userEvent.selectOptions(within(dialog).getByLabelText('Talla'), '10');
    await userEvent.type(within(dialog).getByLabelText('Nombre a estampar (opcional)'), 'Martina');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apuntar reserva' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/orders')).toEqual({
        studentId: 's1',
        productId: 'p1',
        quantity: 1,
        values: { talla: '10', nombre: 'Martina' },
        note: null,
        priceCents: null,
      }),
    );
  });

  it('shows the stock per size with what is left to buy, and registers a purchase by lot', async () => {
    const spy = api({
      'GET /api/admin/equipment/stock': [
        200,
        {
          items: [
            {
              productId: 'p1',
              productName: 'Chándal',
              active: true,
              variants: [
                {
                  variantKey: 'k10',
                  variantLabel: 'Talla 10',
                  bought: 10,
                  delivered: 6,
                  inStock: 4,
                  awaiting: 7,
                  toBuy: 3,
                },
              ],
            },
          ],
        },
      ],
      'GET /api/admin/equipment/purchases': [200, { items: [] }],
      'POST /api/admin/equipment/purchases': [201, { id: 'pu1' }],
    });
    renderApp('/panel/cobros?pestana=material&vista=stock');

    const table = await screen.findByRole('table', { name: 'Stock de Chándal' });
    const row = within(table).getByRole('row', { name: /Talla 10/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Talla 10', '10', '6', '4', '7', '3']);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar compra' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Producto'), 'p1');
    await userEvent.type(within(dialog).getByLabelText('Coste del lote entero (€)'), '600');
    await userEvent.type(within(dialog).getByLabelText('Talla 8'), '5');
    await userEvent.type(within(dialog).getByLabelText('Talla 10'), '15');
    expect(within(dialog).getByText('20 unidades · 30 € cada una')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/purchases')).toMatchObject({
        productId: 'p1',
        costCents: 60000,
        note: null,
        lines: [
          { values: { talla: '8' }, quantity: 5 },
          { values: { talla: '10' }, quantity: 15 },
        ],
      }),
    );
  });

  it('shows what was bought against what was sold, with the margin', async () => {
    api({
      'GET /api/admin/equipment/margins': [
        200,
        {
          products: [
            {
              productId: 'p1',
              productName: 'Chándal',
              unitsBought: 20,
              spentCents: 60000,
              averageCostCents: 3000,
              unitsSold: 10,
              revenueCents: 45000,
              collectedCents: 40000,
              marginCents: 15000,
              marginPerUnitCents: 1500,
            },
          ],
          totals: {
            unitsBought: 20,
            spentCents: 60000,
            unitsSold: 10,
            revenueCents: 45000,
            collectedCents: 40000,
            marginCents: 15000,
          },
        },
      ],
    });
    renderApp('/panel/cobros?pestana=material&vista=margen');

    const table = await screen.findByRole('table', { name: 'Margen por producto' });
    expect(within(table).getByRole('row', { name: /Chándal/ })).toHaveTextContent(
      'Chándal20600 €30 €10450 €400 €15 €150 €',
    );
    expect(screen.getByText('Margen de lo vendido').parentElement).toHaveTextContent('150 €');
  });

  it('creates a product with a list field and a text field', async () => {
    const spy = api({ 'POST /api/admin/equipment/products': [201, { id: 'p2' }] });
    renderApp('/panel/cobros?pestana=material&vista=productos');

    expect(
      await screen.findByText('Talla: 8, 10, 12 · Nombre a estampar (texto)'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo producto' });
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Polo');
    await userEvent.type(within(dialog).getByLabelText('Precio de venta (€)'), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Añadir campo' }));
    await userEvent.type(within(dialog).getByLabelText('Nombre del campo'), 'Talla');
    await userEvent.type(
      within(dialog).getByLabelText('Opciones (separadas por comas)'),
      'S, M, L',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear producto' }));
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/equipment/products')).toEqual({
        name: 'Polo',
        priceCents: 2000,
        active: true,
        fields: [{ id: '', name: 'Talla', kind: 'options', options: ['S', 'M', 'L'] }],
      }),
    );
  });

  it('charges a material order from Cuotas like any other fee, without cancelling it there', async () => {
    const spy = api({
      'GET /api/admin/billing/charges?month=2026-10&kind=monthly': [
        200,
        {
          month: '2026-10',
          label: 'Octubre 2026',
          items: [
            {
              id: 'c2',
              studentId: 's1',
              studentName: 'Martina López Herrera',
              guardianName: 'Rocío Herrera',
              guardianPhone: '612 48 19 30',
              kind: 'material',
              period: '2026-10',
              amountCents: 4500,
              status: 'due',
              paymentId: null,
              receiptNumber: null,
              remindedOn: null,
              coveredCents: 0,
              manual: false,
              note: null,
              fullAmountCents: 4500,
              cancelledCents: 0,
              concept: 'Chándal · Talla 10',
            },
          ],
          totals: { expectedCents: 4500, collectedCents: 0, pendingCents: 4500, overdueCount: 0 },
        },
      ],
      'GET /api/admin/billing/accounts/s1': [
        200,
        {
          points: 0,
          remainingMonths: 9,
          weeklyHours: 2,
          hasPrivateLessons: false,
          membershipPaid: true,
          materialCharges: [{ id: 'c2', concept: 'Chándal · Talla 10', pendingCents: 4500 }],
          totals: [],
        },
      ],
      'POST /api/admin/billing/quote': [
        200,
        {
          concept: 'Chándal · Talla 10',
          periods: ['2026-10'],
          lines: [{ label: 'Chándal · Talla 10', amountCents: 4500 }],
          grossCents: 4500,
          discountPercent: 0,
          totalCents: 4500,
        },
      ],
    });
    renderApp('/panel/cobros?mes=2026-10');

    const row = within(await screen.findByRole('table')).getByRole('row', { name: /Martina/ });
    expect(row).toHaveTextContent('Chándal · Talla 10');
    expect(within(row).queryByRole('button', { name: /Cancelar cuota/ })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: 'Registrar cobro' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cobro' });
    expect(within(dialog).getByRole('button', { name: 'Material' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await within(dialog).findByLabelText('Pedido de material')).toHaveValue('c2');
    await waitFor(() =>
      expect(bodyOf(spy, 'POST', '/api/admin/billing/quote')).toMatchObject({
        kind: 'material',
        chargeId: 'c2',
        studentId: 's1',
      }),
    );
  });
});
