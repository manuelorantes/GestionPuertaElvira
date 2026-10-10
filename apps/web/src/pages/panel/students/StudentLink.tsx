import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';

import { studentPath } from '@/features/students/links';

/** El nombre de un alumno, allí donde aparezca, lleva a su ficha. */
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
      to={studentPath(id)}
      // Dentro de filas que hacen otra cosa al pulsarlas, el enlace va solo a la ficha.
      onClick={(event: MouseEvent) => event.stopPropagation()}
      className={`decoration-1 underline-offset-2 hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}
