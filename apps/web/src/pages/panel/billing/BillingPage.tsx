import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Charge, ChargeKind } from '@/features/billing/api';
import { currentMonth, monthName } from '@/features/billing/money';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Tabs } from '@/shared/ui/Tabs';

import { ChargesTab } from './ChargesTab';
import { PaymentDialog } from './PaymentDialog';
import { PaymentsTab } from './PaymentsTab';
import { ReceiptDialog } from './ReceiptDialog';
import { SettingsTab } from './SettingsTab';
import { WhatsAppDialog } from './WhatsAppDialog';

export type BillingDialog =
  | { type: 'payment'; studentId?: string; kind?: ChargeKind }
  | { type: 'receipt'; paymentId: string }
  | { type: 'whatsapp'; charge: Charge }
  | null;

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('mes') ?? '')
    ? (searchParams.get('mes') as string)
    : currentMonth();
  const tabs = [
    { id: 'cuotas', label: `Cuotas de ${monthName(month)}` },
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
      <ChargesTab month={month} onMonthChange={(m) => setParam('mes', m)} onAction={setDialog} />
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
  return null;
}
