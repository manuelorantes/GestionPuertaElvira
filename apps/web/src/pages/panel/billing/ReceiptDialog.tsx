import { FileText, Printer } from 'lucide-react';
import { useState } from 'react';

import { useCanManageClub } from '@/features/auth/useCanManageClub';
import { usePayment } from '@/features/billing/hooks';
import { formatCents } from '@/features/billing/money';
import { formatDate } from '@/features/students/format';
import { Button } from '@/shared/ui/Button';
import { ClubLogo } from '@/shared/ui/ClubLogo';
import { Dialog } from '@/shared/ui/Dialog';

import { InvoiceDialog } from './InvoiceDialog';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function ReceiptDialog({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const payment = usePayment(paymentId);
  const [invoicing, setInvoicing] = useState(false);
  const canManage = useCanManageClub();
  const p = payment.data;

  if (invoicing && p)
    return (
      <InvoiceDialog
        paymentId={p.id}
        defaultName={p.guardianName}
        onClose={() => setInvoicing(false)}
      />
    );

  return (
    <Dialog open onClose={onClose} labelledBy="receipt-title">
      <div className="flex items-center justify-between border-b border-line px-6 py-5 print:hidden">
        <h2
          id="receipt-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Recibo
        </h2>
      </div>
      <div className="p-6 print:p-0">
        {!p ? (
          <p className="text-ink-muted">Cargando recibo…</p>
        ) : (
          <article className="receipt-sheet rounded-sm border border-line bg-white p-6 text-sm">
            <header className="mb-3 flex items-center gap-3 border-b-4 border-brand pb-3">
              <ClubLogo size={48} />
              <div>
                <p className="font-display text-xl leading-tight font-bold tracking-[0.04em] uppercase">
                  {p.club.name}
                </p>
                <p className="text-[13px] text-ink-muted">
                  Recibo {p.receiptNumber} · {formatDate(p.paidOn)} · NIF {p.club.taxId}
                </p>
              </div>
            </header>
            <Row label="Alumno" value={p.studentName} />
            <Row label="Pagado por" value={p.guardianName} />
            <div className="border-b border-line pb-2">
              <Row label="Concepto" value={p.concept} />
            </div>
            <div className="pt-2">
              {p.lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-3 py-1.5">
                  <span>{line.label}</span>
                  <span>{formatCents(line.amountCents)}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between border-t border-ink pt-2.5">
              <span className="font-semibold">Total</span>
              <span className="font-display text-[28px] font-bold">
                {formatCents(p.totalCents)}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">Forma de pago: {p.methodLabel}</p>
            {p.invoice && (
              <section aria-label="Factura" className="mt-4 rounded-sm border border-line p-4">
                <p className="mb-2 flex items-center gap-2 font-semibold">
                  <FileText aria-hidden size={16} />
                  Factura {p.invoice.number} · {formatDate(p.invoice.issuedOn)}
                </p>
                <Row label="Cliente" value={p.invoice.customerName} />
                <Row label="NIF" value={p.invoice.customerTaxId} />
                <Row label="Dirección" value={p.invoice.customerAddress} />
                <Row label="Base imponible" value={formatCents(p.invoice.baseCents)} />
                <Row
                  label={`IVA ${p.invoice.vatPercent} %`}
                  value={formatCents(p.invoice.vatCents)}
                />
                <Row label="Total factura" value={formatCents(p.invoice.totalCents)} />
                <p className="mt-1 text-[12px] text-ink-muted">
                  {p.club.name} · NIF {p.club.taxId} · {p.club.address}
                </p>
              </section>
            )}
          </article>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        {p && !p.invoice && canManage && (
          <Button variant="secondary" onClick={() => setInvoicing(true)}>
            Emitir factura
          </Button>
        )}
        <Button
          onClick={() => window.print()}
          disabled={!p}
          className="inline-flex items-center gap-2"
        >
          <Printer aria-hidden size={18} />
          Imprimir
        </Button>
      </div>
    </Dialog>
  );
}
