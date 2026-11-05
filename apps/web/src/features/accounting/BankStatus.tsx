import { Badge } from '@/shared/ui/Badge';

/**
 * Si un cobro o movimiento por el banco (tarjeta o transferencia) ya está casado con el extracto. El efectivo no pasa por
 * el banco y no lleva marca.
 */
export function BankStatus({ method, reconciled }: { method: string; reconciled: boolean }) {
  if (reconciled) return <Badge tone="success">Conciliado</Badge>;
  if (method === 'card' || method === 'transfer') return <Badge>Sin conciliar</Badge>;
  return null;
}
