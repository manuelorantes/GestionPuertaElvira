import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { addHoliday } from '@/features/payroll/api';
import { usePayrollMutation } from '@/features/payroll/hooks';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

export function HolidayDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState('');
  const mark = usePayrollMutation(addHoliday);
  const toast = useToast();
  const year = new Date().getFullYear();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await mark.mutateAsync({ date, name: name.trim() || 'Festivo' }).then(
      (removed) => {
        toast(
          `Festivo marcado: ${removed} ${removed === 1 ? 'sesión quitada' : 'sesiones quitadas'}`,
        );
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="holiday-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="holiday-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Marcar festivo
        </h2>
        {mark.isError && <Alert>{apiErrorMessage(mark.error)}</Alert>}
        <DateField
          label="Día festivo"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <TextField
          label="Nombre"
          placeholder="Por ejemplo: Día de la Cruz"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-sm text-ink-muted">
          Ese día no se apuntarán horas solas. Se quitarán todas las sesiones de ese día (salvo las
          de liquidaciones pagadas).
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={mark.isPending} busyLabel="Guardando…">
            Marcar festivo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
