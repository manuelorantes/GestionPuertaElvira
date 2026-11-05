import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { METHODS } from '@/features/accounting/categories';
import {
  centsFromText,
  centsToText,
  formatCents,
  monthLabel,
  shiftMonth,
} from '@/features/billing/money';
import { paySettlement, payAllSettlements, type Settlement } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

const month = (m: string) => monthLabel(m).toLowerCase();

/** Lo que se pide confirmar cuando no se paga justo lo que queda. */
function confirmation(
  paidCents: number,
  owedCents: number,
  settlementMonth: string,
): { title: string; message: string } | null {
  if (paidCents < owedCents) {
    return {
      title: 'Pago parcial',
      message: `Se apuntan ${formatCents(paidCents)} a cuenta y quedan ${formatCents(owedCents - paidCents)} por pagar. Lo que falta se puede pagar después, de otra forma.`,
    };
  }
  if (paidCents > owedCents) {
    return {
      title: 'Pago de más',
      message: `Pagas ${formatCents(paidCents - owedCents)} de más: se apuntan como anticipo de ${month(shiftMonth(settlementMonth, 1))} y la liquidación queda pagada.`,
    };
  }
  return null;
}

/**
 * «Pagar» una liquidación: el diálogo de pago relleno con su concepto, la categoría «Profesores» y lo que queda por
 * pagar. Se elige la forma de pago y se puede pagar otra cantidad: menos, a cuenta; más, lo que sobra va al mes
 * siguiente. En los dos casos, antes se confirma.
 */
export function PaySettlementDialog({
  settlement,
  onClose,
}: {
  settlement: Settlement;
  onClose: () => void;
}) {
  const owed = Math.max(settlement.toPayCents, 0);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState('transfer');
  const [amount, setAmount] = useState(centsToText(owed));
  const [confirming, setConfirming] = useState(false);
  const pay = usePayrollMutation(paySettlement);
  const toast = useToast();
  const year = new Date().getFullYear();
  const cents = centsFromText(amount) ?? 0;
  const invalid = cents < 0 || (cents === 0 && owed > 0);
  const toConfirm = confirmation(cents, owed, settlement.month);
  const name = settlement.teacherName;

  async function save() {
    await pay
      .mutateAsync({
        teacherId: settlement.teacherId,
        month: settlement.month,
        amount: amount.trim(),
        method,
        date,
      })
      .then(
        (result) => {
          if (result.status === 'partial') {
            toast(
              `Pago parcial de ${name}: quedan ${formatCents(result.remainingCents)} por pagar`,
            );
          } else if (result.advanceCents > 0) {
            toast(
              `Liquidación de ${name} pagada; ${formatCents(result.advanceCents)} como anticipo de ${month(shiftMonth(settlement.month, 1))}`,
            );
          } else {
            toast(`Liquidación de ${name} pagada`);
          }
          onClose();
        },
        () => setConfirming(false),
      );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    if (toConfirm) setConfirming(true);
    else void save();
  }

  if (confirming && toConfirm) {
    return (
      <ConfirmDialog
        title={toConfirm.title}
        message={toConfirm.message}
        confirmLabel={`Pagar ${formatCents(cents)}`}
        busy={pay.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void save()}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="pay-settlement-title">
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="pay-settlement-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Pagar la liquidación de {name}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Concepto</dt>
          <dd>
            Liquidación de {month(settlement.month)} · {name}
          </dd>
          <dt className="text-ink-muted">Categoría</dt>
          <dd>Profesores</dd>
          <dt className="text-ink-muted">Queda por pagar</dt>
          <dd className="font-semibold">{formatCents(owed)}</dd>
        </dl>
        {pay.isError && <Alert>{apiErrorMessage(pay.error)}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Importe pagado (€)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select label="Forma de pago" value={method} onChange={setMethod} options={METHODS} />
        </div>
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year + 1}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={pay.isPending} busyLabel="Pagando…">
            Pagar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** «Pagar todas»: cada liquidación pendiente del mes por lo que queda de ella, con la forma de pago y fecha elegidas. */
export function PayAllSettlementsDialog({
  month: settlementMonth,
  pending,
  onClose,
}: {
  month: string;
  pending: Settlement[];
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState('transfer');
  const payAll = usePayrollMutation(payAllSettlements);
  const toast = useToast();
  const year = new Date().getFullYear();
  const total = pending.reduce((sum, s) => sum + Math.max(s.toPayCents, 0), 0);
  const count = `${pending.length} ${pending.length === 1 ? 'liquidación' : 'liquidaciones'}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    void payAll.mutateAsync({ month: settlementMonth, method, date }).then(
      (paid) => {
        toast(`${paid} liquidaciones pagadas`);
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="pay-all-title">
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="pay-all-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Pagar todas las liquidaciones
        </h2>
        <p className="text-sm text-ink-soft">
          Se pagan {count} de {month(settlementMonth)} por {formatCents(total)}, cada una por lo que
          queda de ella, en la categoría «Profesores».
        </p>
        {payAll.isError && <Alert>{apiErrorMessage(payAll.error)}</Alert>}
        <Select label="Forma de pago" value={method} onChange={setMethod} options={METHODS} />
        <DateField
          label="Fecha"
          value={date}
          onChange={setDate}
          fromYear={year - 2}
          toYear={year + 1}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={payAll.isPending} busyLabel="Pagando…">
            Pagar todas
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
