import { monthLabel } from '@/features/billing/money';
import { FEE_PARAM, studentPath } from '@/features/students/links';

import type { FeesVsFixedItem, FeesVsFixedLink } from './api';

const movements = (params: Record<string, string>) =>
  `/panel/contabilidad?${new URLSearchParams({ pestana: 'movimientos', ...params })}`;

/** La dirección del sitio donde se ve una línea del detalle. */
export function feesVsFixedHref(link: FeesVsFixedLink): string {
  switch (link.kind) {
    case 'receipt':
      return `/panel/cobros?${new URLSearchParams({ recibo: link.paymentId })}`;
    case 'fee':
      return `${studentPath(link.studentId)}?${new URLSearchParams({ [FEE_PARAM]: link.month })}`;
    case 'movement':
      return movements({ mes: link.month, movimiento: link.sourceId });
    case 'teacher':
      return `/panel/profesores/${link.teacherId}?${new URLSearchParams({ mes: link.month })}`;
    case 'expected':
      return movements({ mes: link.month, esperado: link.expenseId });
    case 'ledger':
      return movements({ mes: link.month });
  }
}

/** El nombre del enlace de una línea: qué es y adónde lleva. */
export function feesVsFixedLinkLabel({ concept, link }: FeesVsFixedItem): string {
  const month = 'month' in link ? monthLabel(link.month).toLowerCase() : '';
  const where = {
    receipt: 'ver el recibo',
    fee: `ver su cuota de ${month} en su ficha`,
    movement: 'ver el movimiento en Movimientos',
    teacher: `ver sus horas y su pago de ${month}`,
    expected: `ver en los gastos esperados de ${month}`,
    ledger: `ver los movimientos de ${month}`,
  }[link.kind];
  return `${concept}: ${where}`;
}
