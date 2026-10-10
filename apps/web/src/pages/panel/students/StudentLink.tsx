import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

import { SHEET_PARAM, studentPath } from '@/features/students/links';

/** Dentro de Alumnos, la ficha es su propia página; en el resto, se abre encima sin salir de donde se está. */
function useStudentHref(id: string): string {
  const { pathname, search } = useLocation();
  if (pathname.startsWith('/panel/alumnos')) return studentPath(id);
  const params = new URLSearchParams(search);
  params.set(SHEET_PARAM, id);
  return `${pathname}?${params}`;
}

/** El nombre de un alumno, allí donde aparezca, abre su ficha. */
export function StudentLink({
  id,
  children,
  className = '',
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={useStudentHref(id)}
      // Dentro de filas que hacen otra cosa al pulsarlas, el enlace solo abre la ficha.
      onClick={(event: MouseEvent) => event.stopPropagation()}
      className={`decoration-1 underline-offset-2 hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}
