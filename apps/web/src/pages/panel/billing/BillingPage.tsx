import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Charge, ChargeKind } from '@/features/billing/api';
import { currentMonth, monthName } from '@/features/billing/money';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { CancelChargeDialog } from './CancelChargeDialog';
import { ChargesTab, type ChargesView } from './ChargesTab';
import { PaymentDialog } from './PaymentDialog';
import { PaymentsTab } from './PaymentsTab';
import { ReceiptDialog } from './ReceiptDialog';
import { SettingsTab } from './SettingsTab';
import { WhatsAppDialog } from './WhatsAppDialog';

export type BillingDialog =
  | { type: 'payment'; studentId?: string; kind?: ChargeKind }
  | { type: 'receipt'; paymentId: string }
  | { type: 'whatsapp'; charge: Charge }
  | { type: 'cancel'; charge: Charge }
  | null;

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // ?mes=AAAA-MM (cuotas de ese mes), ?mes=socio (cuotas de socio de la temporada) o ?mes=canceladas.
  const view: ChargesView =
    searchParams.get('mes') === 'socio'
      ? 'membership'
      : searchParams.get('mes') === 'canceladas'
        ? 'cancelled'
        : 'month';
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('mes') ?? '')
    ? (searchParams.get('mes') as string)
    : currentMonth();
  const tabs = [
    { id: 'cuotas', label: 'Cuotas' },
    { id: 'registro', label: 'Cobros registrados' },
    { id: 'tarifas', label: 'Tarifas y ajustes' },
  ];
  const tab = tabs.some((t) => t.id === searchParams.get('pestana'))
    ? (searchParams.get('pestana') as string)
    : 'cuotas';
  // ?recibo=<id> abre ese recibo (p. ej. desde el historial).
  const [dialog, setDialog] = useState<BillingDialog>(() => {
    const receipt = searchParams.get('recibo');
    return receipt ? { type: 'receipt', paymentId: receipt } : null;
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: key === 'mes' });
  }

  function renderTab() {
    if (tab === 'registro')
      return (
        <PaymentsTab onOpenReceipt={(paymentId) => setDialog({ type: 'receipt', paymentId })} />
      );
    if (tab === 'tarifas') return <SettingsTab />;
    return (
      <ChargesTab
        key={view === 'month' ? month : view}
        month={month}
        view={view}
        onMonthChange={(m) => setParam('mes', m)}
        onAction={setDialog}
      />
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={`Plazo: del 1 al 5 de ${monthName(currentMonth())}`}
        title="Cobros y cuotas"
        action={{
          label: 'Registrar cobro',
          icon: <Wallet aria-hidden size={18} />,
          onClick: () => setDialog({ type: 'payment' }),
        }}
      />
      <Tabs
        label="Vistas de cobros"
        tabs={tabs}
        value={tab}
        onChange={(id) => setParam('pestana', id)}
      >
        {renderTab()}
      </Tabs>
      <BillingDialogs dialog={dialog} onChange={setDialog} />
    </main>
  );
}

/** Diálogos de Cobros, compartidos por la página y la ficha del alumno. */
export function BillingDialogs({
  dialog,
  onChange,
}: {
  dialog: BillingDialog;
  onChange: (dialog: BillingDialog) => void;
}) {
  if (dialog?.type === 'payment')
    return (
      <PaymentDialog
        initialStudentId={dialog.studentId}
        initialKind={dialog.kind}
        onClose={() => onChange(null)}
        onSaved={(paymentId) => onChange({ type: 'receipt', paymentId })}
      />
    );
  if (dialog?.type === 'receipt')
    return <ReceiptDialog paymentId={dialog.paymentId} onClose={() => onChange(null)} />;
  if (dialog?.type === 'whatsapp')
    return <WhatsAppDialog charge={dialog.charge} onClose={() => onChange(null)} />;
  if (dialog?.type === 'cancel')
    return <CancelChargeDialog charge={dialog.charge} onClose={() => onChange(null)} />;
  return null;
}
