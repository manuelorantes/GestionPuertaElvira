import type { LedgerItem } from './api';

export type KindFilter = 'all' | 'income' | 'expense';
export type MethodFilter = 'all' | 'card' | 'transfer' | 'cash';

export interface LedgerFilter {
  kind: KindFilter;
  /** Solo cuenta con «Ingresos»: en el resto de vistas se ignora. */
  method: MethodFilter;
}

export const KIND_OPTIONS: { id: KindFilter; label: string; param: string | null }[] = [
  { id: 'all', label: 'Todo', param: null },
  { id: 'income', label: 'Ingresos', param: 'ingresos' },
  { id: 'expense', label: 'Pagos', param: 'pagos' },
];

export const METHOD_OPTIONS: { id: MethodFilter; label: string; param: string | null }[] = [
  { id: 'all', label: 'Todos', param: null },
  { id: 'card', label: 'Tarjeta', param: 'tarjeta' },
  { id: 'transfer', label: 'Transferencia', param: 'transferencia' },
  { id: 'cash', label: 'Efectivo', param: 'efectivo' },
];

/** Lee el filtro de la URL (?tipo=ingresos|pagos y, con ingresos, ?forma=tarjeta|transferencia|efectivo). */
export function ledgerFilterFrom(params: URLSearchParams): LedgerFilter {
  const kind = KIND_OPTIONS.find((k) => k.param === params.get('tipo'))?.id ?? 'all';
  const method =
    kind === 'income'
      ? (METHOD_OPTIONS.find((m) => m.param === params.get('forma'))?.id ?? 'all')
      : 'all';
  return { kind, method };
}

/** Escribe el filtro en la URL; al dejar «Ingresos» se olvida la forma de pago. */
export function withLedgerFilter(params: URLSearchParams, filter: LedgerFilter): URLSearchParams {
  const next = new URLSearchParams(params);
  const kind = KIND_OPTIONS.find((k) => k.id === filter.kind)?.param ?? null;
  const method =
    filter.kind === 'income'
      ? (METHOD_OPTIONS.find((m) => m.id === filter.method)?.param ?? null)
      : null;
  if (kind) next.set('tipo', kind);
  else next.delete('tipo');
  if (method) next.set('forma', method);
  else next.delete('forma');
  return next;
}

/** Movimientos que se ven con el filtro y su suma con signo (ingresos +, pagos −). */
export function applyLedgerFilter(
  items: LedgerItem[],
  filter: LedgerFilter,
): { items: LedgerItem[]; netCents: number; active: boolean } {
  const visible = items.filter(
    (item) =>
      (filter.kind === 'all' || item.kind === filter.kind) &&
      (filter.kind !== 'income' || filter.method === 'all' || item.method === filter.method),
  );
  return {
    items: visible,
    netCents: visible.reduce(
      (sum, item) => sum + (item.kind === 'income' ? item.amountCents : -item.amountCents),
      0,
    ),
    active: filter.kind !== 'all',
  };
}

/** «No hay ingresos con tarjeta este mes.» */
export function emptyFilterMessage(filter: LedgerFilter): string {
  if (filter.kind === 'expense') return 'No hay pagos este mes.';
  if (filter.kind === 'income' && filter.method !== 'all') {
    const how = { card: 'con tarjeta', transfer: 'por transferencia', cash: 'en efectivo' }[
      filter.method
    ];
    return `No hay ingresos ${how} este mes.`;
  }
  if (filter.kind === 'income') return 'No hay ingresos este mes.';
  return 'No hay movimientos este mes.';
}
