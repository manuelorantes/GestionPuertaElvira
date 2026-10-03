import { Banknote, Landmark } from 'lucide-react';
import type { FormEvent } from 'react';

import type { ChargeKind } from '@/features/billing/api';
import { formatCents } from '@/features/billing/money';
import { CONCEPTS, usePaymentForm } from '@/features/billing/usePaymentForm';
import { useStudents } from '@/features/students/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { ToggleButton } from '@/shared/ui/ToggleButton';

interface PaymentDialogProps {
  initialStudentId: string | undefined;
  initialKind: ChargeKind | undefined;
  onClose: () => void;
  onSaved: (paymentId: string) => void;
}

export function PaymentDialog({
  initialStudentId,
  initialKind,
  onClose,
  onSaved,
}: PaymentDialogProps) {
  const form = usePaymentForm(initialStudentId, initialKind);
  const students = useStudents('active', '');
  const toast = useToast();
  const options = (students.data?.items ?? []).map((s) => ({ value: s.id, label: s.fullName }));
  const selected = students.data?.items.find((s) => s.id === form.studentId);
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.canSave || !form.quote) return;
    const total = form.quote.totalCents;
    const id = await form.submit().catch(() => null);
    if (!id) return;
    toast(`Cobro registrado · ${formatCents(total)}`);
    onSaved(id);
  }

  return (
    <Dialog open onClose={onClose} labelledBy="payment-title">
      <form onSubmit={(event) => void submit(event)}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="payment-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            Registrar cobro
          </h2>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {form.saveError && <Alert>{form.saveError}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Select
              label="Alumno"
              value={form.studentId}
              onChange={form.setStudentId}
              options={[{ value: '', label: 'Elige un alumno' }, ...options]}
            />
            {selected && (
              <span className="text-[13px] text-ink-muted">
                {selected.groups.map((g) => g.name).join(' · ') || 'Sin grupo'}
              </span>
            )}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Concepto</legend>
            <div className="flex flex-wrap gap-2">
              {CONCEPTS.map((c) => (
                <ToggleButton
                  key={c.id}
                  disabled={form.unavailable(c.id)}
                  pressed={form.concept === c.id}
                  onClick={() => form.setConcept(c.id)}
                  className="h-9 rounded-full font-medium"
                >
                  {c.label}
                </ToggleButton>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Forma de pago</legend>
              <div className="flex gap-2">
                <ToggleButton
                  pressed={form.method === 'cash'}
                  onClick={() => form.setMethod('cash')}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5"
                >
                  <Banknote aria-hidden size={16} />
                  Efectivo
                </ToggleButton>
                <ToggleButton
                  pressed={form.method === 'transfer'}
                  onClick={() => form.setMethod('transfer')}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5"
                >
                  <Landmark aria-hidden size={16} />
                  Transferencia
                </ToggleButton>
              </div>
            </fieldset>
            <DateField
              label="Fecha"
              value={form.date}
              onChange={form.setDate}
              fromYear={year - 1}
              toYear={year + 1}
            />
          </div>
          {form.concept === 'month' && (
            <Switch
              label="Prorratear desde la fecha (mes de alta)"
              checked={form.prorate}
              onChange={form.setProrate}
            />
          )}
          {form.concept !== 'membership' && (
            <Switch
              label="Descuento especial"
              checked={form.special.enabled}
              onChange={(enabled) => form.setSpecial({ ...form.special, enabled })}
            />
          )}
          {form.special.enabled && form.concept !== 'membership' && (
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <TextField
                label="Descuento (%)"
                inputMode="numeric"
                value={form.special.percent}
                onChange={(e) =>
                  form.setSpecial({ ...form.special, percent: e.target.value.replace(/\D/g, '') })
                }
              />
              <TextField
                label="Motivo"
                placeholder="Canje de 5 puntos"
                value={form.special.concept}
                onChange={(e) => form.setSpecial({ ...form.special, concept: e.target.value })}
              />
            </div>
          )}
          {form.quoteError && <Alert>{form.quoteError}</Alert>}
          {form.studentId && !form.quoteError && (
            <div className="rounded-sm bg-sand p-4" aria-busy={form.quoting}>
              {form.quote ? (
                <>
                  {form.quote.lines.map((line) => (
                    <div key={line.label} className="flex justify-between gap-3 py-1 text-sm">
                      <span>{line.label}</span>
                      <span>{formatCents(line.amountCents)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex items-baseline justify-between border-t border-line-strong pt-2">
                    <span className="font-semibold">Total a cobrar</span>
                    <span className="font-display text-3xl font-bold text-brand-strong">
                      {formatCents(form.quote.totalCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">Cubre: {form.quote.concept}</p>
                </>
              ) : (
                <p className="text-sm text-ink-muted">Calculando…</p>
              )}
            </div>
          )}
          <p className="text-[13px] text-ink-muted">
            El cobro se hace fuera de la aplicación. Aquí solo queda anotado.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!form.canSave} busy={form.saving} busyLabel="Guardando…">
            Guardar cobro
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
