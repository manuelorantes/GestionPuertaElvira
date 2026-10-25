import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';

/** A quién listar en la hoja de un viernes: los que vinieron, los que no, o todos. */
export type SheetScope = 'present' | 'absent' | 'all';

const SHEET_SCOPES: { value: SheetScope; label: string }[] = [
  { value: 'present', label: 'Asistieron' },
  { value: 'absent', label: 'No asistieron' },
  { value: 'all', label: 'Ambos' },
];

interface Props {
  /** «02/10», para el título. */
  dayLabel: string;
  onPrint: (scope: SheetScope) => void;
  onClose: () => void;
}

/** Antes de imprimir la hoja de un viernes se elige a quién listar. */
export function PrintFridayDialog({ dayLabel, onPrint, onClose }: Props) {
  const [scope, setScope] = useState<SheetScope>('all');

  return (
    <Dialog open onClose={onClose} labelledBy="print-friday-title">
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onPrint(scope);
        }}
      >
        <h2
          id="print-friday-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Imprimir la hoja del viernes {dayLabel}
        </h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Qué alumnos listar</legend>
          <ul className="flex flex-col divide-y divide-line-soft rounded-sm border border-line">
            {SHEET_SCOPES.map((option) => (
              <li key={option.value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                  <input
                    type="radio"
                    name="sheet-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Imprimir</Button>
        </div>
      </form>
    </Dialog>
  );
}
