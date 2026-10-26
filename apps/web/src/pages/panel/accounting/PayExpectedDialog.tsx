import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { payExpected, type ExpectedMonth } from '@/features/accounting/api';
import { METHODS } from '@/features/accounting/categories';
import { useAccountingMutation } from '@/features/accounting/hooks';
import { resolveChoice, type PeriodChoice } from '@/features/accounting/periodShares';
import { centsFromText, centsToText, formatCents, monthLabel } from '@/features/billing/money';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

import { PeriodSharesField } from './PeriodSharesField';

/** «Pagar» un gasto esperado: anota el apunte con lo que ha costado de verdad (por defecto, lo esperado). */
export function PayExpectedDialog({
  expected,
  onClose,
}: {
  expected: ExpectedMonth;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState('transfer');
  const [amount, setAmount] = useState(centsToText(expected.expectedCents));
  // Corresponde al mes del gasto esperado, aunque se pague otro mes.
  const [period, setPeriod] = useState<PeriodChoice>({
    kind: 'one',
    period: expected.period === date.slice(0, 7) ? '' : expected.period,
  });
  const save = useAccountingMutation(payExpected);
  const toast = useToast();
  const year = new Date().getFullYear();
  const cents = centsFromText(amount) ?? 0;
  const resolved = resolveChoice(period, date.slice(0, 7), cents);
  const invalid = cents <= 0 || resolved.problem !== null;
  const month = monthLabel(expected.period).toLowerCase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    await save
      .mutateAsync({
        id: expected.expenseId,
        month: expected.period,
        date,
        method,
        amount: amount.trim(),
        period: resolved.period ?? date.slice(0, 7),
        ...(resolved.shares && { shares: resolved.shares }),
      })
      .then(
        () => {
          toast(`${expected.concept} de ${month} pagado`);
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="pay-expected-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="pay-expected-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Pagar {expected.concept}
        </h2>
        <p className="text-sm text-ink-soft">
          Lo esperado en {month} son {formatCents(expected.expectedCents)}. Si ha costado otra cosa,
          pon lo que se ha pagado: el apunte va a «{expected.categoryLabel}».
        </p>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
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
        <PeriodSharesField
          date={date}
          totalCents={cents}
          value={period}
          onChange={setPeriod}
          defaultLabel="El de la fecha"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid} busy={save.isPending} busyLabel="Guardando…">
            Pagar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
