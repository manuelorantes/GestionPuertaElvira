import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { currentMonth, monthLabel } from '@/features/billing/money';
import { adjustPoints, type StudentPoints } from '@/features/points/api';
import { useMovements, usePointsMutation, useStudentPoints } from '@/features/points/hooks';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { SortHeader } from '@/shared/ui/SortHeader';
import { useToast } from '@/shared/ui/Toast';

import { KIND_LABEL, signed } from './labels';

type SortKey = 'member' | 'name' | 'points' | 'earned' | 'redeemed';
interface Sort {
  key: SortKey;
  descending: boolean;
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

const collator = new Intl.Collator('es', { sensitivity: 'base' });

const VALUE: Record<Exclude<SortKey, 'name'>, (s: StudentPoints) => number> = {
  member: (s) => s.memberNumber ?? Infinity,
  points: (s) => s.points,
  earned: (s) => s.seasonEarned,
  redeemed: (s) => s.seasonRedeemed,
};

/** Como en Alumnos: de menor a mayor (o de la A a la Z); a igualdad, por nombre. */
function sorted(items: StudentPoints[], sort: Sort): StudentPoints[] {
  const byName = (a: StudentPoints, b: StudentPoints) => collator.compare(a.name, b.name);
  const result = [...items].sort((a, b) =>
    sort.key === 'name' ? byName(a, b) : VALUE[sort.key](a) - VALUE[sort.key](b) || byName(a, b),
  );
  return sort.descending ? result.reverse() : result;
}

/** Alumnos con sus puntos del mes, lo ganado y canjeado en la temporada, ajuste a mano e historial. */
export function StudentsTab({
  month,
  focus,
  onFocus,
}: {
  month: string;
  /** Alumno cuyo historial está abierto (desde su ficha). */
  focus: string | null;
  onFocus: (id: string | null) => void;
}) {
  const students = useStudentPoints(month);
  const [sort, setSort] = useState<Sort>({ key: 'name', descending: false });
  const [search, setSearch] = useState('');
  const [adjusting, setAdjusting] = useState<StudentPoints | null>(null);
  const all = students.data ?? [];
  const shown = sorted(
    all.filter((s) => normalise(s.name).includes(normalise(search.trim()))),
    sort,
  );
  const header = (label: string, name: string, key: SortKey) => (
    <SortHeader
      label={label}
      name={name}
      active={sort.key === key}
      descending={sort.descending}
      onSort={() =>
        setSort((current) => ({
          key,
          descending: current.key === key ? !current.descending : false,
        }))
      }
    />
  );
  const focused = all.find((s) => s.id === focus) ?? null;

  if (students.isPending) return <p className="text-ink-muted">Cargando alumnos…</p>;
  if (students.isError) return <Alert>{apiErrorMessage(students.error)}</Alert>;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <input
          type="search"
          aria-label="Buscar alumno"
          placeholder="Buscar alumno"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full max-w-72 rounded-sm border border-line-strong bg-surface px-3 text-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Puntos de {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                {header('Nº', 'número de socio', 'member')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {header('Alumno', 'nombre', 'name')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {header(
                  `Puntos de ${monthLabel(month).split(' ')[0]?.toLowerCase() ?? ''}`,
                  'puntos',
                  'points',
                )}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {header('Ganados', 'ganados en la temporada', 'earned')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {header('Canjeados', 'canjeados en la temporada', 'redeemed')}
              </th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <td className="px-5 py-2.5 text-ink-muted tabular-nums">{s.memberNumber ?? '—'}</td>
                <td className="px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => onFocus(s.id)}
                    className="cursor-pointer text-left font-medium hover:underline"
                  >
                    {s.name}
                  </button>
                </td>
                <td className="px-5 py-2.5 font-semibold tabular-nums">{s.points}</td>
                <td className="px-5 py-2.5 tabular-nums">{s.seasonEarned}</td>
                <td className="px-5 py-2.5 tabular-nums">{s.seasonRedeemed}</td>
                <td className="px-5 py-2.5 text-right">
                  {month === currentMonth() && (
                    <button
                      type="button"
                      onClick={() => setAdjusting(s)}
                      aria-label={`Ajustar los puntos de ${s.name}`}
                      className="h-9 cursor-pointer rounded-sm border border-line-strong px-3 text-[13px] font-semibold hover:bg-surface-muted"
                    >
                      Ajustar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && (
        <p className="px-5 py-8 text-center text-ink-muted">Ningún alumno con ese nombre.</p>
      )}
      <p className="px-5 py-3 text-[13px] text-ink-muted">
        Los puntos valen solo en el mes en que se ganan: si no se gastan, el mes siguiente se
        empieza de cero. Ganados y canjeados son de toda la temporada. Los ajustes cuentan en el mes
        de hoy.
      </p>
      {adjusting && <AdjustDialog student={adjusting} onClose={() => setAdjusting(null)} />}
      {focus && (
        <HistoryDialog studentId={focus} name={focused?.name ?? ''} onClose={() => onFocus(null)} />
      )}
    </Card>
  );
}

function AdjustDialog({ student, onClose }: { student: StudentPoints; onClose: () => void }) {
  const [delta, setDelta] = useState('1');
  const [note, setNote] = useState('');
  const save = usePointsMutation(() => adjustPoints(student.id, Number(delta), note.trim()));
  const toast = useToast();
  const valid = /^-?\d+$/.test(delta.trim()) && Number(delta) !== 0 && note.trim() !== '';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    void save.mutateAsync(undefined).then(
      () => {
        toast('Puntos ajustados');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="adjust-points-title">
      <form noValidate onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="adjust-points-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            Ajustar puntos
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
          <p className="text-sm">
            {student.name} tiene <strong>{student.points}</strong> puntos este mes.
          </p>
          <TextField
            label="Puntos"
            help="En negativo para restar"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          <TextField label="Motivo" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid} busy={save.isPending} busyLabel="Guardando…">
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function HistoryDialog({
  studentId,
  name,
  onClose,
}: {
  studentId: string;
  name: string;
  onClose: () => void;
}) {
  const movements = useMovements({ student: studentId });
  return (
    <Dialog open onClose={onClose} labelledBy="points-history-title" size="wide">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2
          id="points-history-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Puntos de {name || 'este alumno'}
        </h2>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
        {movements.isPending ? (
          <p className="text-ink-muted">Cargando…</p>
        ) : movements.isError ? (
          <Alert>{apiErrorMessage(movements.error)}</Alert>
        ) : movements.data.length === 0 ? (
          <p className="text-ink-muted">Sin movimientos esta temporada.</p>
        ) : (
          <ul aria-label="Movimientos" className="text-sm">
            {movements.data.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 border-b border-line-soft py-2 last:border-b-0"
              >
                <span className="w-24 shrink-0 tabular-nums">{formatDate(m.date)}</span>
                <span className="w-16 shrink-0 text-[13px] text-ink-muted">
                  {KIND_LABEL[m.kind]}
                </span>
                <span className="flex-1">{m.concept}</span>
                <span
                  className={`w-10 text-right font-semibold tabular-nums ${m.delta < 0 ? 'text-danger-fg' : 'text-success-fg'}`}
                >
                  {signed(m.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
