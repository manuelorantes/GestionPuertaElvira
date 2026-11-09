import { X } from 'lucide-react';
import type { FormEvent } from 'react';

import type { OnAccountShare } from '@/features/billing/api';
import { formatCents } from '@/features/billing/money';
import { useOnAccountForm } from '@/features/billing/useOnAccountForm';
import { useStudents } from '@/features/students/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/Combobox';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { PaymentMethodPicker } from './PaymentMethodPicker';

/**
 * «Añadir dinero a cuenta»: un importe para uno o varios alumnos que se reparte según lo que debe cada uno; primero
 * paga lo pendiente (cuota de socio y cuotas hasta este mes) y lo que sobra queda a favor para las siguientes.
 */
export function OnAccountDialog({ onClose }: { onClose: () => void }) {
  const form = useOnAccountForm();
  const students = useStudents('active', '');
  const toast = useToast();
  const items = students.data?.items ?? [];
  const options = items
    .filter((s) => !form.studentIds.includes(s.id))
    .map((s) => ({ value: s.id, label: s.fullName }));
  const nameOf = (id: string) => items.find((s) => s.id === id)?.fullName ?? '';
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.canSave) return;
    const total = form.amountCents;
    const ids = await form.submit().catch(() => null);
    if (!ids) return;
    toast(`Dinero a cuenta añadido · ${formatCents(total)}`);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} labelledBy="on-account-title">
      <form onSubmit={(event) => void submit(event)}>
        <div className="border-b border-line px-6 py-5">
          <h2
            id="on-account-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            Añadir dinero a cuenta
          </h2>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {form.saveError && <Alert>{form.saveError}</Alert>}
          <TextField
            label="Importe (€)"
            inputMode="decimal"
            placeholder="p. ej. 100"
            value={form.amount}
            onChange={(e) => form.setAmount(e.target.value)}
            error={form.amountInvalid ? 'Escribe un importe mayor que 0 €.' : undefined}
          />
          <PaymentMethodPicker value={form.method} onChange={form.setMethod} />
          <DateField
            label="Fecha"
            value={form.date}
            onChange={form.setDate}
            fromYear={year - 1}
            toYear={year + 1}
          />
          <div className="flex flex-col gap-2">
            <Combobox
              label="Alumnos"
              options={options}
              value=""
              onChange={form.addStudent}
              placeholder="Escribe para añadir un alumno…"
            />
            {form.studentIds.length > 0 && (
              <ul aria-label="Alumnos elegidos" className="flex flex-wrap gap-2">
                {form.studentIds.map((id) => (
                  <li
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pr-1 pl-3 text-sm"
                  >
                    {nameOf(id)}
                    <button
                      type="button"
                      aria-label={`Quitar a ${nameOf(id)}`}
                      onClick={() => form.removeStudent(id)}
                      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:bg-line"
                    >
                      <X aria-hidden size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {form.quoteError && <Alert>{form.quoteError}</Alert>}
          {form.studentIds.length > 0 && form.amountCents > 0 && !form.quoteError && (
            <div className="rounded-sm bg-sand p-4" aria-busy={form.quoting}>
              {form.shares ? (
                <SharesPreview shares={form.shares} />
              ) : (
                <p className="text-sm text-ink-muted">Calculando…</p>
              )}
            </div>
          )}
          <p className="text-[13px] text-ink-muted">
            Se reparte según lo que debe cada uno: primero paga la cuota de socio y las cuotas hasta
            este mes; lo que sobra queda a su favor y paga las siguientes. Cada alumno recibe su
            recibo de pago a cuenta.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!form.canSave} busy={form.saving} busyLabel="Guardando…">
            Añadir a cuenta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** El reparto: a qué va lo de cada alumno y si le falta algo o le queda a favor. */
function SharesPreview({ shares }: { shares: OnAccountShare[] }) {
  return (
    <ul aria-label="Reparto" className="flex flex-col divide-y divide-line-strong">
      {shares.map((share) => {
        const total = share.membershipCents + share.monthlyCents;
        const left = share.owedCents - total;
        return (
          <li key={share.studentId} className="flex flex-col gap-0.5 py-2 text-sm">
            <div className="flex justify-between gap-3 font-semibold">
              <span>{share.name}</span>
              <span>{formatCents(total)}</span>
            </div>
            <span className="text-[13px] text-ink-muted">
              Debía {formatCents(share.owedCents)}
              {share.membershipCents > 0 &&
                ` · ${formatCents(share.membershipCents)} a la cuota de socio`}
              {share.monthlyCents > 0 && ` · ${formatCents(share.monthlyCents)} a sus cuotas`}
            </span>
            <span className="text-[13px] text-ink-muted">
              {left > 0
                ? `Le quedan ${formatCents(left)} pendientes`
                : left < 0
                  ? `Quedan ${formatCents(-left)} a su favor`
                  : 'Queda al día'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
