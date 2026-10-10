import {
  type Order,
  type OrderId,
  type Product,
  type ProductId,
  type Purchase,
  type PurchaseId,
} from '../../src/domain/equipment/mod.ts';
import {
  ManageOrders,
  ManagePurchases,
  type OrderRepository,
  type ProductRepository,
  type PurchaseRepository,
  SaveProduct,
  type StockLedger,
  type StudentLookup,
} from '../../src/application/equipment/mod.ts';
import { QuotePayment, RegisterPayment } from '../../src/application/billing/mod.ts';
import { LocalDate, Money, YearMonth } from '../../src/domain/common/mod.ts';
import {
  ChargeId,
  DocumentNumber,
  Payment,
  PaymentId,
  QuoteLine,
  StudentRef,
} from '../../src/domain/billing/mod.ts';
import { BillingFixture } from './billing.ts';

/** Dobles en memoria del material, con los de Cobros para sus cobros. */
export class EquipmentFixture
  implements ProductRepository, OrderRepository, PurchaseRepository, StockLedger, StudentLookup {
  readonly billing = new BillingFixture('2026-10-10T10:00:00+02:00');
  readonly products = new Map<string, Product>();
  readonly orders = new Map<string, Order>();
  readonly purchaseList = new Map<string, Purchase>();

  product(id: ProductId): Promise<Product | null> {
    return Promise.resolve(this.products.get(id.value) ?? null);
  }

  saveProduct(product: Product): Promise<void> {
    this.products.set(product.id.value, product);
    return Promise.resolve();
  }

  order(id: OrderId): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id.value) ?? null);
  }

  saveOrder(order: Order): Promise<void> {
    this.orders.set(order.id.value, order);
    return Promise.resolve();
  }

  purchase(id: PurchaseId): Promise<Purchase | null> {
    return Promise.resolve(this.purchaseList.get(id.value) ?? null);
  }

  savePurchase(purchase: Purchase): Promise<void> {
    this.purchaseList.set(purchase.id.value, purchase);
    return Promise.resolve();
  }

  deletePurchase(id: PurchaseId): Promise<void> {
    this.purchaseList.delete(id.value);
    return Promise.resolve();
  }

  variants(product: ProductId): Promise<Map<string, { bought: number; taken: number }>> {
    const result = new Map<string, { bought: number; taken: number }>();
    const entry = (key: string) => {
      const value = result.get(key) ?? { bought: 0, taken: 0 };
      result.set(key, value);
      return value;
    };
    for (const purchase of this.purchaseList.values()) {
      if (!purchase.product.equals(product)) continue;
      for (const line of purchase.lines) entry(line.selection.variantKey).bought += line.quantity;
    }
    for (const order of this.orders.values()) {
      if (order.product.equals(product) && order.takesStock()) {
        entry(order.selection.variantKey).taken += order.quantity;
      }
    }
    return Promise.resolve(result);
  }

  usedValues(product: ProductId): Promise<Set<string>> {
    const used = new Set<string>();
    const add = (values: Readonly<Record<string, string>>) => {
      for (const [field, value] of Object.entries(values)) used.add(`${field}=${value}`);
    };
    for (const order of this.orders.values()) {
      if (order.product.equals(product)) add(order.selection.values);
    }
    for (const purchase of this.purchaseList.values()) {
      if (purchase.product.equals(product)) purchase.lines.forEach((l) => add(l.selection.values));
    }
    return Promise.resolve(used);
  }

  exists(studentId: string): Promise<boolean> {
    return Promise.resolve(this.billing.students.has(studentId));
  }

  saveProducts(): SaveProduct {
    return new SaveProduct(this, this);
  }

  manageOrders(): ManageOrders {
    return new ManageOrders(this, this, this.billing, this, this, this.billing.clock);
  }

  managePurchases(): ManagePurchases {
    return new ManagePurchases(this, this, this, this.billing.clock);
  }

  /** Cobra lo que le falta al cobro de material de un pedido. */
  pay(studentId: string, chargeId: string): Promise<string> {
    const fx = this.billing;
    return new RegisterPayment(
      new QuotePayment(fx, fx, fx, fx, fx.clock, fx),
      fx,
      fx,
      fx,
      fx.transactions,
      fx,
      fx.locks,
      fx,
    ).execute({
      studentId,
      kind: 'material',
      months: 1,
      method: 'cash',
      date: '2026-10-10',
      specialPercent: null,
      specialAmountCents: null,
      specialConcept: null,
      redeemPoints: 0,
      chargeId,
    });
  }

  /** Un cobro que cubre solo una parte del cobro de un pedido. */
  payPart(studentId: string, chargeId: string, cents: number): Promise<void> {
    return this.billing.savePayment(
      Payment.register({
        id: PaymentId.generate(),
        student: StudentRef.fromString(studentId),
        paidOn: LocalDate.fromString('2026-10-10'),
        method: 'cash',
        receipt: DocumentNumber.receipt(2026, 99),
        kind: 'material',
        concept: 'Parte del chándal',
        lines: [new QuoteLine('Parte', Money.cents(cents))],
        total: Money.cents(cents),
        periods: [YearMonth.fromString('2026-10')],
        charge: ChargeId.fromString(chargeId),
      }),
    );
  }

  /** «Chándal» a 45 € con talla (8, 10, 12) y nombre a estampar. */
  async tracksuit(): Promise<string> {
    return await this.saveProducts().create({
      name: 'Chándal',
      priceCents: 4500,
      active: true,
      fields: [
        { id: 'talla', name: 'Talla', kind: 'options', options: ['8', '10', '12'] },
        { id: 'nombre', name: 'Nombre a estampar', kind: 'text', options: [] },
      ],
    });
  }
}
