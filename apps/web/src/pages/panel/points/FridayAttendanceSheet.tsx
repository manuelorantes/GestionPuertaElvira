import { useEffect } from 'react';

import type { FridayGrid } from '@/features/points/api';
import { formatDate } from '@/features/students/format';

interface Props {
  date: string;
  students: FridayGrid['students'];
  onPrinted: () => void;
}

/**
 * La hoja en papel de un viernes para apuntar quién viene: la cabecera del día, todos los alumnos de alta y una casilla
 * vacía cada uno. Solo existe para imprimirse: en cuanto se monta abre la impresión del navegador y, al cerrarla,
 * desaparece. `receipt-sheet` hace que al imprimir salga solo ella.
 */
export function FridayAttendanceSheet({ date, students, onPrinted }: Props) {
  useEffect(() => {
    window.addEventListener('afterprint', onPrinted);
    window.print();
    return () => window.removeEventListener('afterprint', onPrinted);
  }, [onPrinted]);

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
          Hoja para apuntar la asistencia de los viernes: marca a cada alumno que venga.
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
          {students.map((s) => (
            <tr key={s.id} className="border-b border-line-soft">
              <th scope="row" className="py-2 pr-3 font-medium">
                {s.name}
              </th>
              <td className="py-2 pr-3 text-ink-muted">{s.memberNumber ?? '—'}</td>
              <td className="py-2 text-center">
                <span aria-hidden className="inline-block size-4 border border-ink align-middle" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
