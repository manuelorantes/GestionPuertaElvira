import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { quoteReconciliationFee, type ReconciliationFee } from '@/features/accounting/api';
import { formatCents } from '@/features/billing/money';
import { useStudents } from '@/features/students/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Combobox } from '@/shared/ui/Combobox';

/**
 * Las cuotas que se cobrarán con una transferencia repartida a mano: se elige el alumno y la app dice cuál le toca
 * (la pendiente más antigua o la del mes), como al cobrar desde Cobros.
 */
export function FeePicker({
  day,
  fees,
  onChange,
}: {
  day: string;
  fees: ReconciliationFee[];
  onChange: (fees: ReconciliationFee[]) => void;
}) {
  const students = useStudents('active', '');
  const [student, setStudent] = useState('');
  const quote = useMutation({
    mutationFn: (studentId: string) => quoteReconciliationFee(studentId, day),
  });
  const options = (students.data?.items ?? [])
    .filter((s) => !fees.some((f) => f.studentId === s.id))
    .map((s) => ({ value: s.id, label: s.fullName }));

  function choose(studentId: string) {
    setStudent(studentId);
    if (!studentId) return;
    const name = options.find((o) => o.value === studentId)?.label ?? '';
    quote.mutate(studentId, {
      onSuccess: (fee) => {
        onChange([...fees, { studentId, student: name, ...fee }]);
        setStudent('');
      },
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
        Cobrar la cuota de
      </p>
      {fees.length > 0 && (
        <ul className="flex flex-col gap-1">
          {fees.map((f) => (
            <li key={f.studentId} className="flex flex-wrap items-center gap-x-3 text-sm">
              <span className="min-w-0 flex-1">
                {f.student} · {f.concept}
              </span>
              <span className="font-semibold tabular-nums">{formatCents(f.amountCents)}</span>
              <button
                type="button"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-surface-raised"
                aria-label={`Quitar la cuota de ${f.student}`}
                onClick={() => onChange(fees.filter((x) => x.studentId !== f.studentId))}
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
        placeholder={quote.isPending ? 'Calculando la cuota…' : 'Escribe para buscar…'}
      />
      {quote.isError && <Alert>{apiErrorMessage(quote.error)}</Alert>}
    </div>
  );
}
