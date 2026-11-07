import type { Classroom } from './api';

/** Aulas del club en el orden de las columnas del horario. */
export const CLASSROOMS: readonly Classroom[] = ['alfil', 'caballo', 'peon', 'rey'];

const NAMES: Record<Classroom, string> = {
  alfil: 'Alfil',
  caballo: 'Caballo',
  peon: 'Peón',
  rey: 'Rey Batallador',
};

/** «Aula Alfil». */
export function classroomLabel(classroom: Classroom | string): string {
  const name = NAMES[classroom as Classroom] as string | undefined;
  return name ? `Aula ${name}` : `Aula ${classroom}`;
}
