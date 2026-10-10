import { ArrowRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { SHEET_PARAM, studentPath } from '@/features/students/links';

import { StudentSheet } from './StudentPanel';

/**
 * La ficha de un alumno abierta encima de cualquier página del panel (`?ficha=`): al cerrarla se sigue donde se estaba;
 * «Ir a Alumnos» lleva a su ficha en la sección Alumnos.
 */
export function StudentQuickView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get(SHEET_PARAM);
  if (!id) return null;
  const open = (other: string | null) =>
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (other === null) next.delete(SHEET_PARAM);
      else next.set(SHEET_PARAM, other);
      return next;
    });

  return (
    <StudentSheet
      key={id}
      id={id}
      onClose={() => open(null)}
      onOpenStudent={open}
      aside={
        <Link
          to={studentPath(id)}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-paper px-4 text-sm font-semibold text-brand shadow-overlay hover:bg-surface-muted"
        >
          Ir a Alumnos
          <ArrowRight aria-hidden size={16} />
        </Link>
      }
    />
  );
}
