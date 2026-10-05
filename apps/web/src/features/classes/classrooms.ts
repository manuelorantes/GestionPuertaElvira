import type { Classroom } from './api';

/** Aulas del club en el orden de las columnas del horario. */
export const CLASSROOMS: readonly Classroom[] = ['alfil', 'caballo', 'peon'];

const NAMES: Record<Classroom, string> = { alfil: 'Alfil', caballo: 'Caballo', peon: 'Peón' };

/** «Aula Alfil». */
export function classroomLabel(classroom: Classroom | string): string {
  const name = NAMES[classroom as Classroom] as string | undefined;
  return name ? `Aula ${name}` : `Aula ${classroom}`;
}

/** Columna del horario (1, 2 o 3). */
export function classroomColumn(classroom: Classroom): number {
  return CLASSROOMS.indexOf(classroom) + 1;
}
