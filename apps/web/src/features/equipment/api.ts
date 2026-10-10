import { apiGet, apiSend } from '@/shared/api/client';

/** `options`: lista cerrada y obligatoria (define la variante y el stock); `text`: texto libre opcional. */
export type FieldKind = 'options' | 'text';

interface ProductField {
  /** Vacío en un campo nuevo. */
  id: string;
  name: string;
  kind: FieldKind;
  options: string[];
}

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  fields: ProductField[];
}

export type ProductInput = Omit<Product, 'id'>;

/** «paid»: pedido con su cobro cubierto. */
export type OrderState = 'reserved' | 'ordered' | 'paid' | 'cancelled';

export interface Order {
  id: string;
  studentId: string;
  studentName: string;
  productId: string;
  productName: string;
  quantity: number;
  values: Record<string, string>;
  detail: string;
  variantLabel: string;
  note: string | null;
  status: OrderState;
  priceCents: number | null;
  /** Lo que se debe (lo conservado, si se canceló con algo cobrado) y lo cubierto de su cobro. */
  dueCents: number;
  coveredCents: number;
  chargeId: string | null;
  createdOn: string;
  orderedOn: string | null;
  deliveredOn: string | null;
  cancelledOn: string | null;
  returnedToStock: boolean;
}

export interface OrderFilter {
  open: boolean;
  status?: OrderState | '';
  productId?: string;
  season?: string;
  studentId?: string;
}

export interface OrderInput {
  studentId: string;
  productId: string;
  quantity: number;
  values: Record<string, string>;
  note: string | null;
  /** Con precio se apunta directamente como pedido (con su cobro). */
  priceCents: number | null;
}

export interface Purchase {
  id: string;
  productId: string;
  productName: string;
  boughtOn: string;
  costCents: number;
  units: number;
  unitCostCents: number;
  note: string | null;
  lines: { values: Record<string, string>; variantLabel: string; quantity: number }[];
}

export interface PurchaseInput {
  productId: string;
  date: string;
  costCents: number;
  note: string | null;
  lines: { values: Record<string, string>; quantity: number }[];
}

interface StockVariant {
  variantKey: string;
  variantLabel: string;
  bought: number;
  delivered: number;
  inStock: number;
  /** Reservado o pedido y aún sin entregar. */
  awaiting: number;
  /** Lo que falta comprar para entregar todo lo apuntado. */
  toBuy: number;
}

export interface ProductStock {
  productId: string;
  productName: string;
  active: boolean;
  variants: StockVariant[];
}

interface Margin {
  productId: string;
  productName: string;
  unitsBought: number;
  spentCents: number;
  averageCostCents: number | null;
  unitsSold: number;
  revenueCents: number;
  collectedCents: number;
  marginCents: number | null;
  marginPerUnitCents: number | null;
}

export interface Margins {
  products: Margin[];
  totals: {
    unitsBought: number;
    spentCents: number;
    unitsSold: number;
    revenueCents: number;
    collectedCents: number;
    marginCents: number | null;
  };
}

const BASE = '/api/admin/equipment';

export async function fetchProducts(): Promise<Product[]> {
  return (await apiGet<{ items: Product[] }>(`${BASE}/products`)).items;
}

export async function createProduct(input: ProductInput): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/products`, input)).id;
}

export function updateProduct({ id, ...input }: Product): Promise<void> {
  return apiSend('PUT', `${BASE}/products/${id}`, input);
}

export async function fetchOrders(filter: OrderFilter): Promise<Order[]> {
  const query = new URLSearchParams();
  if (filter.open) query.set('open', '1');
  for (const key of ['status', 'productId', 'season', 'studentId'] as const) {
    const value = filter[key];
    if (value) query.set(key, value);
  }
  return (await apiGet<{ items: Order[] }>(`${BASE}/orders?${query.toString()}`)).items;
}

export async function createOrder(input: OrderInput): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/orders`, input)).id;
}

export function editOrder(
  id: string,
  input: { quantity: number; values: Record<string, string>; note: string | null },
): Promise<void> {
  return apiSend('PUT', `${BASE}/orders/${id}`, input);
}

export function placeOrder({ id, priceCents }: { id: string; priceCents: number }): Promise<void> {
  return apiSend('POST', `${BASE}/orders/${id}/place`, { priceCents });
}

export function changeOrderPrice({
  id,
  priceCents,
}: {
  id: string;
  priceCents: number;
}): Promise<void> {
  return apiSend('PUT', `${BASE}/orders/${id}/price`, { priceCents });
}

export function deliverOrder({ id, date }: { id: string; date: string }): Promise<void> {
  return apiSend('POST', `${BASE}/orders/${id}/deliver`, { date });
}

export function undoDelivery(id: string): Promise<void> {
  return apiSend('POST', `${BASE}/orders/${id}/undo-delivery`, {});
}

export function cancelOrder({
  id,
  returnToStock,
}: {
  id: string;
  returnToStock: boolean;
}): Promise<void> {
  return apiSend('POST', `${BASE}/orders/${id}/cancel`, { returnToStock });
}

export function reactivateOrder(id: string): Promise<void> {
  return apiSend('POST', `${BASE}/orders/${id}/reactivate`, {});
}

export async function fetchPurchases(): Promise<Purchase[]> {
  return (await apiGet<{ items: Purchase[] }>(`${BASE}/purchases`)).items;
}

export async function createPurchase(input: PurchaseInput): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/purchases`, input)).id;
}

/** Una compra no cambia de producto: se envía todo lo demás. */
export function updatePurchase(input: PurchaseInput & { id: string }): Promise<void> {
  const { date, costCents, note, lines } = input;
  return apiSend('PUT', `${BASE}/purchases/${input.id}`, { date, costCents, note, lines });
}

export function deletePurchase(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/purchases/${id}`);
}

export async function fetchStock(): Promise<ProductStock[]> {
  return (await apiGet<{ items: ProductStock[] }>(`${BASE}/stock`)).items;
}

export function fetchMargins(): Promise<Margins> {
  return apiGet(`${BASE}/margins`);
}
