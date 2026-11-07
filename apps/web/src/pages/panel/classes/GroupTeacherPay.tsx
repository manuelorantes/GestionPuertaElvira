import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import { setGroupPay, type PayUnit } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';

type Pay = { unit: PayUnit; amountCents: number };

const UNITS = [
  { value: 'hour', label: 'Por hora' },
  { value: 'session', label: 'Por sesión' },
];

function payLabel(pay: Pay): string {
  return `${formatCents(pay.amountCents)} ${pay.unit === 'hour' ? 'por hora' : 'por sesión'}`;
}

interface GroupTeacherPayProps {
  groupId: string;
  groupName: string;
  pay: Pay | null;
  /** Solo superadministración la cambia; administración la ve. */
  canEdit: boolean;
}

/** Lo que cobra quien da la clase: su tarifa por hora o una propia de la clase (por hora o por sesión). */
export function GroupTeacherPay({ groupId, groupName, pay, canEdit }: GroupTeacherPayProps) {
  const [draft, setDraft] = useState(pay ? centsToText(pay.amountCents) : '');
  const [unit, setUnit] = useState<PayUnit>(pay?.unit ?? 'hour');
  const [pending, setPending] = useState<{ pay: Pay | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = usePayrollMutation((next: Pay | null) =>
    setGroupPay(
      groupId,
      next && { unit: next.unit, amount: centsToText(next.amountCents).replace(',', '.') },
    ),
  );
  const draftCents = centsFromText(draft);
  const shown = pay ? payLabel(pay) : 'La tarifa por hora de quien la dé';
  const unchanged = pay !== null && pay.unit === unit && pay.amountCents === draftCents;

  if (!canEdit) {
    return (
      <p className="flex justify-between gap-3 text-sm">
        <span className="text-ink-muted">Cobra</span>
        <span className="font-medium">{shown}</span>
      </p>
    );
  }

  async function confirm() {
    if (!pending) return;
    setError(null);
    try {
      await save.mutateAsync(pending.pay);
      if (pending.pay === null) {
        setDraft('');
        setUnit('hour');
      }
      setPending(null);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="text-ink-muted">Cobra: </span>
        <span className="font-medium">{shown}</span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Tarifa de la clase (€)"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          error={draft.trim() !== '' && draftCents === null ? 'La tarifa no es válida.' : undefined}
        />
        <Select
          label="Se paga"
          options={UNITS}
          value={unit}
          onChange={(value) => setUnit(value as PayUnit)}
        />
        <Button
          variant="secondary"
          disabled={draftCents === null || unchanged}
          onClick={() =>
            draftCents !== null && setPending({ pay: { unit, amountCents: draftCents } })
          }
        >
          Guardar tarifa
        </Button>
        {pay !== null && (
          <Button variant="ghost" onClick={() => setPending({ pay: null })}>
            Quitar tarifa
          </Button>
        )}
      </div>
      {pending && (
        <ConfirmDialog
          title="Tarifa de la clase"
          message={
            pending.pay === null
              ? `Quien dé «${groupName}» volverá a cobrarla a su tarifa por hora. Cambiarán las liquidaciones sin pagar.`
              : `Quien dé «${groupName}» (su profesor o un sustituto) cobrará ${payLabel(pending.pay)} en lugar de su tarifa. Cambiarán las liquidaciones sin pagar, también las de meses anteriores.`
          }
          confirmLabel={pending.pay === null ? 'Quitar tarifa' : 'Guardar tarifa'}
          onConfirm={() => void confirm()}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          busy={save.isPending}
          error={error}
        />
      )}
    </div>
  );
}
