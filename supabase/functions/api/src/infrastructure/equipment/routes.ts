import { InvalidValue } from '../../domain/common/mod.ts';
import {
  EquipmentReports,
  ManageOrders,
  ManagePurchases,
  OrderNotFound,
  orderStateFromName,
  type ProductInput,
  type PurchaseInput,
  SaveProduct,
} from '../../application/equipment/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlChargeRepository } from '../persistence/billing.ts';
import {
  SqlEquipmentQuery,
  SqlOrderRepository,
  SqlProductRepository,
  SqlPurchaseRepository,
  SqlStockLedger,
  SqlStudentLookup,
} from '../persistence/equipment.ts';

function equipment(api: ApiApp, scope: RequestScope) {
  const tx = scope.tx;
  const products = new SqlProductRepository(tx);
  const stock = new SqlStockLedger(tx);
  const query = new SqlEquipmentQuery(tx);
  return {
    query,
    products: new SaveProduct(products, stock),
    orders: new ManageOrders(
      new SqlOrderRepository(tx),
      products,
      new SqlChargeRepository(tx),
      stock,
      new SqlStudentLookup(tx),
      api.deps.clock,
    ),
    purchases: new ManagePurchases(new SqlPurchaseRepository(tx), products, stock, api.deps.clock),
    reports: new EquipmentReports(query),
  };
}

function productInput(body: JsonBody): ProductInput {
  return {
    name: body.requiredString('name'),
    priceCents: body.requiredInt('priceCents'),
    active: body.bool('active', true),
    fields: body.objectList('fields').map((f) => ({
      id: f.optionalString('id'),
      name: f.requiredString('name'),
      kind: f.requiredString('kind'),
      options: f.stringList('options'),
    })),
  };
}

function purchaseInput(body: JsonBody): Omit<PurchaseInput, 'productId'> {
  return {
    date: body.requiredString('date'),
    costCents: body.requiredInt('costCents'),
    note: body.optionalString('note'),
    lines: body.objectList('lines').map((l) => ({
      values: l.stringMap('values'),
      quantity: l.requiredInt('quantity'),
    })),
  };
}

/** Rutas del material deportivo (/api/admin/equipment): productos, pedidos, compras, stock y margen. */
export function registerEquipmentRoutes(api: ApiApp): void {
  registerDomainErrors({
    ProductNotFound: [404, 'not_found'],
    OrderNotFound: [404, 'not_found'],
    PurchaseNotFound: [404, 'not_found'],
    EquipmentStudentNotFound: [404, 'not_found'],
    NotEnoughStock: [409, 'not_enough_stock'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) => ({
    method,
    path: `/api/admin/equipment${path}`,
    access: 'admin' as const,
  });

  api.defineRoute(admin('GET', '/products'), async (c, scope) => {
    return c.json({ items: await equipment(api, scope).query.products() });
  });

  api.defineRoute(admin('POST', '/products'), async (c, scope) => {
    const id = await equipment(api, scope).products.create(
      productInput(await JsonBody.from(c.req.raw)),
    );
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('PUT', '/products/:id'), async (c, scope) => {
    await equipment(api, scope).products.update(
      param(c, 'id'),
      productInput(await JsonBody.from(c.req.raw)),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/orders'), async (c, scope) => {
    const status = c.req.query('status');
    const season = c.req.query('season');
    if (season !== undefined && season !== '' && !/^\d{4}$/.test(season)) {
      throw new InvalidValue('season', 'Indica la temporada con el año en que empieza.');
    }
    const id = (name: string) => {
      const value = c.req.query(name);
      if (value === undefined || value === '') return null;
      if (!/^[0-9a-f-]{36}$/i.test(value)) throw new InvalidValue(name, 'Identificador no válido.');
      return value;
    };
    return c.json({
      items: await equipment(api, scope).query.orders({
        open: c.req.query('open') === '1',
        status: status === undefined || status === '' ? null : orderStateFromName(status),
        productId: id('productId'),
        studentId: id('studentId'),
        season: season === undefined || season === '' ? null : Number(season),
      }),
    });
  });

  api.defineRoute(admin('POST', '/orders'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    const id = await equipment(api, scope).orders.reserve({
      studentId: body.requiredString('studentId'),
      productId: body.requiredString('productId'),
      quantity: body.optionalInt('quantity') ?? 1,
      values: body.stringMap('values'),
      note: body.optionalString('note'),
      priceCents: body.optionalInt('priceCents'),
    });
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('GET', '/orders/:id'), async (c, scope) => {
    const order = await equipment(api, scope).query.order(param(c, 'id'));
    if (order === null) throw new OrderNotFound();
    return c.json(order);
  });

  api.defineRoute(admin('PUT', '/orders/:id'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await equipment(api, scope).orders.edit(param(c, 'id'), {
      quantity: body.optionalInt('quantity') ?? 1,
      values: body.stringMap('values'),
      note: body.optionalString('note'),
    });
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/orders/:id/place'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await equipment(api, scope).orders.place(param(c, 'id'), body.requiredInt('priceCents'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('PUT', '/orders/:id/price'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await equipment(api, scope).orders.changePrice(param(c, 'id'), body.requiredInt('priceCents'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/orders/:id/deliver'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await equipment(api, scope).orders.deliver(param(c, 'id'), body.optionalString('date'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/orders/:id/undo-delivery'), async (c, scope) => {
    await equipment(api, scope).orders.undoDelivery(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/orders/:id/cancel'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await equipment(api, scope).orders.cancel(param(c, 'id'), body.bool('returnToStock'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('POST', '/orders/:id/reactivate'), async (c, scope) => {
    await equipment(api, scope).orders.reactivate(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/purchases'), async (c, scope) => {
    const product = c.req.query('productId');
    return c.json({
      items: await equipment(api, scope).query.purchases(
        product === undefined || product === '' ? null : product,
      ),
    });
  });

  api.defineRoute(admin('POST', '/purchases'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    const id = await equipment(api, scope).purchases.register({
      productId: body.requiredString('productId'),
      ...purchaseInput(body),
    });
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('PUT', '/purchases/:id'), async (c, scope) => {
    await equipment(api, scope).purchases.update(
      param(c, 'id'),
      purchaseInput(await JsonBody.from(c.req.raw)),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('DELETE', '/purchases/:id'), async (c, scope) => {
    await equipment(api, scope).purchases.delete(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/stock'), async (c, scope) => {
    return c.json({ items: await equipment(api, scope).reports.stock() });
  });

  api.defineRoute(admin('GET', '/margins'), async (c, scope) => {
    return c.json(await equipment(api, scope).reports.margins());
  });
}
