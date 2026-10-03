import { Printer } from 'lucide-react';

import { formatCents, monthLabel } from '@/features/billing/money';
import { useSettlementSheet } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate } from '@/features/students/format';
import { Button } from '@/shared/ui/Button';
import { ClubLogo } from '@/shared/ui/ClubLogo';
import { Dialog } from '@/shared/ui/Dialog';

export function SettlementSheetDialog({
  teacherId,
  month,
  onClose,
}: {
  teacherId: string;
  month: string;
  onClose: () => void;
}) {
  const sheet = useSettlementSheet(teacherId, month);
  const s = sheet.data;

  return (
    <Dialog open onClose={onClose} labelledBy="sheet-title">
      <h2
        id="sheet-title"
        className="border-b border-line px-6 py-5 font-display text-2xl font-bold tracking-[0.04em] uppercase print:hidden"
      >
        Liquidación
      </h2>
      <div className="p-6 print:p-0">
        {!s ? (
          <p className="text-ink-muted">Cargando liquidación…</p>
        ) : (
          <article className="receipt-sheet rounded-sm border border-line bg-white p-6 text-sm">
            <header className="mb-3 flex items-center gap-3 border-b-4 border-brand pb-3">
              <ClubLogo size={48} />
              <div>
                <p className="font-display text-xl leading-tight font-bold tracking-[0.04em] uppercase">
                  {s.club.name}
                </p>
                <p className="text-[13px] text-ink-muted">
                  Liquidación de {monthLabel(month).toLowerCase()} · NIF {s.club.taxId}
                </p>
              </div>
            </header>
            <p className="py-1.5 font-medium">{s.teacherName}</p>
            {s.lines.map((line) => (
              <div
                key={line.label}
                className="flex justify-between gap-3 border-t border-line-soft py-1.5"
              >
                <span>
                  {line.label} · {hoursLabel(line.minutes)}
                </span>
                <span>{formatCents(line.amountCents)}</span>
              </div>
            ))}
            <div className="mt-1.5 flex items-baseline justify-between border-t border-ink pt-2.5">
              <span className="font-semibold">
                Total · {hoursLabel(s.minutes)} × {formatCents(s.rateCents)}/h
              </span>
              <span className="font-display text-[28px] font-bold">
                {formatCents(s.amountCents)}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">
              {s.status === 'paid' && s.paidOn
                ? `Pagada el ${formatDate(s.paidOn)}`
                : 'Pendiente de pago'}
            </p>
          </article>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4 print:hidden">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={() => window.print()} disabled={!s}>
          <Printer aria-hidden size={18} />
          Imprimir
        </Button>
      </div>
    </Dialog>
  );
}
