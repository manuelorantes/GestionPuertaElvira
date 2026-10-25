import { useBalances } from '@/features/accounting/hooks';
import { formatCents } from '@/features/billing/money';
import { Kpi } from '@/shared/ui/Kpi';

/** Lo que tiene el club hoy y dónde está: en el banco (cuenta y tarjeta) o en caja (efectivo). */
export function BalanceCards() {
  const balances = useBalances();
  const amount = (cents: number | undefined) => (cents === undefined ? '—' : formatCents(cents));

  return (
    <div className="mb-6 grid [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] gap-4">
      <Kpi
        accent
        label="Saldo del club"
        value={amount(balances.data?.clubCents)}
        hint="Banco y caja"
      />
      <Kpi
        label="Saldo en el banco"
        value={amount(balances.data?.bankCents)}
        hint="Cuenta bancaria y tarjeta"
      />
      <Kpi label="Saldo en caja" value={amount(balances.data?.cashCents)} hint="Efectivo" />
    </div>
  );
}
