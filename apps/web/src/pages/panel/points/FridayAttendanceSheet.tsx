import { useEffect } from 'react';

import type { FridayGrid } from '@/features/points/api';
import { formatDate } from '@/features/students/format';

import { type SheetScope } from './PrintFridayDialog';

interface Props {
  date: string;
  scope: SheetScope;
  students: FridayGrid['students'];
  onPrinted: () => void;
}

const SCOPE_NOTE: Record<SheetScope, string | null> = {
  present: 'Solo los que asistieron.',
  absent: 'Solo los que no asistieron.',
  all: null,
};

const listed = (students: FridayGrid['students'], date: string, scope: SheetScope) =>
  students.filter((s) => scope === 'all' || s.present.includes(date) === (scope === 'present'));

/**
 * La hoja en papel de un viernes para apuntar quién viene: la cabecera del día y los alumnos elegidos (los que vinieron,
 * los que no, o todos) con una casilla cada uno, marcada si ya consta que vino. Solo existe para imprimirse: en cuanto se monta abre la impresión del navegador y, al cerrarla,
 * desaparece. `receipt-sheet` hace que al imprimir salga solo ella.
 */
export function FridayAttendanceSheet({ date, scope, students, onPrinted }: Props) {
  useEffect(() => {
    window.addEventListener('afterprint', onPrinted);
    window.print();
    return () => window.removeEventListener('afterprint', onPrinted);
    // Cambiar de hoja (otro día o a quién listar) vuelve a imprimir aunque la anterior siga montada.
  }, [date, scope, onPrinted]);

  const day = formatDate(date);
  const titleId = `friday-sheet-${date}`;
  return (
    <section
      aria-labelledby={titleId}
      className="receipt-sheet hidden flex-col gap-4 text-sm print:flex"
    >
      <header>
        <h2 id={titleId} className="font-display text-xl font-bold tracking-[0.04em] uppercase">
          Viernes {day}
        </h2>
        <p className="text-ink-muted">
          Hoja para apuntar la asistencia de los viernes: marca a cada alumno que venga.{' '}
          {SCOPE_NOTE[scope]}
        </p>
      </header>
      <table className="w-full text-left">
        <caption className="sr-only">Hoja de asistencia del viernes {day}</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            <th scope="col" className="py-2 pr-3">
              Alumno
            </th>
            <th scope="col" className="w-24 py-2 pr-3">
              Nº socio
            </th>
            <th scope="col" className="w-16 py-2 text-center">
              Vino
            </th>
          </tr>
        </thead>
        <tbody>
          {listed(students, date, scope).map((s) => (
            <tr key={s.id} className="border-b border-line-soft">
              <th scope="row" className="py-2 pr-3 font-medium">
                {s.name}
              </th>
              <td className="py-2 pr-3 text-ink-muted">{s.memberNumber ?? '—'}</td>
              <td className="py-2 text-center">
                {s.present.includes(date) ? (
                  <span className="inline-flex size-4 items-center justify-center border border-ink align-middle text-[11px] leading-none font-bold">
                    <span className="sr-only">Sí</span>
                    <span aria-hidden>✓</span>
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-block size-4 border border-ink align-middle"
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
