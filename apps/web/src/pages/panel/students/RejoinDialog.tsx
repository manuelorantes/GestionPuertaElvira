import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import type { ClassGroup } from '@/features/classes/api';
import { todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';

interface RejoinDialogProps {
  name: string;
  groups: ClassGroup[];
  onClose: () => void;
  onRejoin: (date: string, groupIds: string[]) => Promise<unknown>;
}

/**
 * Volver a dar de alta a un alumno de baja: desde qué día y en qué grupos (sin ninguno, vuelve como socio sin clases). El
 * horario especial en un grupo se ajusta después desde su ficha.
 */
export function RejoinDialog({ name, groups, onClose, onRejoin }: RejoinDialogProps) {
  const [date, setDate] = useState(todayIso());
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date) return setError('Indica la fecha de alta.');
    setBusy(true);
    setError(null);
    try {
      await onRejoin(date, chosen);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} labelledBy="rejoin-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 p-6">
        <h2
          id="rejoin-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Dar de alta de nuevo a {name}
        </h2>
        {error && <Alert>{error}</Alert>}
        <DateField
          label="Fecha de alta"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Grupos</legend>
          <ul className="flex max-h-64 flex-col divide-y divide-line-soft overflow-auto rounded-sm border border-line">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(g.id)}
                    onChange={() => toggle(g.id)}
                  />
                  <span className="flex-1">
                    {g.name} <span className="text-ink-muted">· {g.slotLabel}</span>
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {g.occupied}/{g.capacity}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-muted">
            Sin ningún grupo, vuelve como socio sin clases. Conserva su número de socio, su familia
            y su historial.
          </p>
        </fieldset>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy} busyLabel="Guardando…">
            Dar de alta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
