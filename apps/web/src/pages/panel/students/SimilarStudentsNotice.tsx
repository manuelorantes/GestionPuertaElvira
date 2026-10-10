import { useNavigate } from 'react-router';

import type { StudentSummary } from '@/features/students/api';
import { formatDate } from '@/features/students/format';
import { studentPath } from '@/features/students/links';
import { useSimilarStudents } from '@/features/students/hooks';
import { useDebouncedValue } from '@/shared/useDebouncedValue';

const describe = (s: StudentSummary) =>
  [
    `socio nº ${s.memberNumber}`,
    s.age === null ? null : `${s.age} años`,
    ...s.groups.map((g) => g.name),
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Al dar de alta, los alumnos con el mismo nombre y primer apellido: a uno de baja se le puede dar de alta de nuevo
 * (conserva su número de socio, familia e historial) en vez de crear otro; de uno de alta, se avisa para no duplicarlo.
 * Es solo un aviso: si es otra persona, el alta sigue.
 */
export function SimilarStudentsNotice({
  fullName,
  onLeave,
}: {
  fullName: string;
  /** Cierra el alta antes de ir a la ficha de otro alumno. */
  onLeave: () => void;
}) {
  const similar = useSimilarStudents(useDebouncedValue(fullName, 400));
  const navigate = useNavigate();
  const found = similar.data ?? [];
  if (found.length === 0) return null;
  const go = (path: string) => {
    onLeave();
    void navigate(path);
  };
  const withdrawn = found.filter((s) => s.status === 'withdrawn');
  const active = found.filter((s) => s.status !== 'withdrawn');

  return (
    <section
      aria-label="Alumnos con un nombre parecido"
      className="flex flex-col gap-3 rounded-sm border border-warning-fg/40 bg-warning-bg px-4 py-3 text-sm"
    >
      {withdrawn.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-warning-fg">
            ¿Es {withdrawn.length === 1 ? 'este alumno, que está' : 'alguno de estos, que están'} de
            baja?
          </p>
          <ul className="flex flex-col gap-2">
            {withdrawn.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-ink">{s.fullName}</span>
                  <span className="block text-[13px] text-ink-soft">
                    {describe(s)}
                    {s.withdrawnOn ? ` · de baja desde el ${formatDate(s.withdrawnOn)}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => go(studentPath(s.id, 'rejoin'))}
                  className="inline-flex h-9 cursor-pointer items-center rounded-sm bg-brand px-3 text-[13px] font-semibold text-surface-raised hover:bg-brand-strong"
                >
                  Es este: darle de alta de nuevo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-warning-fg">
            Ya hay {active.length === 1 ? 'un alumno' : 'alumnos'} de alta con un nombre parecido:
          </p>
          <ul className="flex flex-col gap-2">
            {active.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium text-ink">{s.fullName}</span>
                  <span className="block text-[13px] text-ink-soft">{describe(s)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => go(studentPath(s.id))}
                  aria-label={`Ver la ficha de ${s.fullName}`}
                  className="inline-flex h-9 cursor-pointer items-center rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-muted"
                >
                  Ver ficha
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[13px] text-ink-soft">
        Si es otra persona, sigue con el alta como siempre.
      </p>
    </section>
  );
}
