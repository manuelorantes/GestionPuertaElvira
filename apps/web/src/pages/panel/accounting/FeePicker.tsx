import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type ChosenFee, quoteReconciliationFee } from '@/features/accounting/api';
import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import { useStudents } from '@/features/students/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Combobox } from '@/shared/ui/Combobox';
import { TextField } from '@/shared/ui/TextField';

const ON_ACCOUNT = 'Pago a cuenta';

/**
 * Lo que se cobrará a cada alumno con un movimiento repartido a mano. Se elige el alumno (también un socio provisional)
 * y qué se le cobra: la cuota del mes que le toca, su cuota de socio pendiente o un pago a cuenta, que queda como saldo
 * a favor hasta que se sepa a qué va.
 */
export function FeePicker({
  day,
  fees,
  remainingCents,
  onChange,
}: {
  day: string;
  fees: ChosenFee[];
  /** Lo que aún falta para el importe del banco: lo que se propone cobrar a cuenta. */
  remainingCents: number;
  onChange: (fees: ChosenFee[]) => void;
}) {
  const active = useStudents('active', '');
  const provisional = useStudents('provisional', '');
  const [student, setStudent] = useState('');
  const [onAccount, setOnAccount] = useState('');
  const quote = useMutation({
    mutationFn: (studentId: string) => quoteReconciliationFee(studentId, day),
  });
  const options = [
    ...(active.data?.items ?? []).map((s) => ({ value: s.id, label: s.fullName })),
    ...(provisional.data?.items ?? []).map((s) => ({
      value: s.id,
      label: `${s.fullName} (provisional)`,
    })),
  ];
  const name = options.find((o) => o.value === student)?.label ?? '';
  const taken = (kind: ChosenFee['kind']) =>
    fees.some((f) => f.studentId === student && f.kind === kind);

  function choose(studentId: string) {
    setStudent(studentId);
    quote.reset();
    if (!studentId) return;
    setOnAccount(remainingCents > 0 ? centsToText(remainingCents) : '');
    quote.mutate(studentId);
  }

  function add(fee: Omit<ChosenFee, 'studentId' | 'student'>) {
    onChange([...fees, { studentId: student, student: name, ...fee }]);
    setStudent('');
    quote.reset();
  }

  const onAccountCents = centsFromText(onAccount);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Cobrar a un alumno
      </p>
      {fees.length > 0 && (
        <ul className="flex flex-col gap-1">
          {fees.map((f) => (
            <li
              key={`${f.studentId}:${f.kind}`}
              className="flex flex-wrap items-center gap-x-3 text-sm"
            >
              <span className="min-w-0 flex-1">
                {f.student} · {f.concept}
              </span>
              <span className="font-semibold tabular-nums">{formatCents(f.amountCents)}</span>
              <button
                type="button"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised"
                aria-label={`Quitar ${f.concept} de ${f.student}`}
                onClick={() => onChange(fees.filter((x) => x !== f))}
              >
                <X aria-hidden size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Combobox
        label="Alumno"
        value={student}
        onChange={choose}
        options={options}
        placeholder={quote.isPending ? 'Calculando sus cuotas…' : 'Escribe para buscar…'}
      />
      {student && quote.data && (
        <FeeOptions
          monthly={taken('monthly') ? null : quote.data.monthly}
          membership={taken('membership') ? null : quote.data.membership}
          name={name}
          onAdd={add}
        />
      )}
      {student && quote.data && (
        <div className="flex flex-col gap-2 rounded-sm border border-line bg-surface-raised p-3">
          {!taken('credit') && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <TextField
                  label="A cuenta (€)"
                  inputMode="decimal"
                  value={onAccount}
                  onChange={(e) => setOnAccount(e.target.value)}
                />
              </div>
              <Button
                size="md"
                variant="secondary"
                disabled={onAccountCents === null || onAccountCents <= 0}
                onClick={() =>
                  add({ kind: 'credit', concept: ON_ACCOUNT, amountCents: onAccountCents ?? 0 })
                }
              >
                Añadir a cuenta
              </Button>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            Lo cobrado a cuenta queda como saldo a favor del alumno y paga sus próximas cuotas.
          </p>
        </div>
      )}
      {quote.isError && <Alert>{apiErrorMessage(quote.error)}</Alert>}
    </div>
  );
}

type Quote = { concept: string; amountCents: number } | null;

/** Las cuotas pendientes que se le pueden cobrar a un alumno, cada una con su botón. */
function FeeOptions({
  monthly,
  membership,
  name,
  onAdd,
}: {
  monthly: Quote;
  membership: Quote;
  name: string;
  onAdd: (fee: Omit<ChosenFee, 'studentId' | 'student'>) => void;
}) {
  const choices = [
    ...(monthly ? [{ kind: 'monthly' as const, ...monthly }] : []),
    ...(membership ? [{ kind: 'membership' as const, ...membership }] : []),
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">¿Qué se le cobra a {name}?</p>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <Button key={c.kind} size="md" variant="secondary" onClick={() => onAdd(c)}>
              {c.concept} · {formatCents(c.amountCents)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
