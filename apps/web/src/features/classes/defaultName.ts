import type { GroupPayload } from './api';
import { classroomLabel } from './classrooms';
import { LEVELS } from './levels';
import { WEEKDAYS } from './schedule';

/**
 * Nombre que la API da a un grupo sin nombre propio: «Lunes y miércoles 17:00 · Iniciación · Peón».
 * Misma regla que el dominio de la API; aquí solo sirve de vista previa.
 */
export function defaultGroupName(
  values: Pick<GroupPayload, 'days' | 'start' | 'level' | 'classroom'>,
) {
  const names = WEEKDAYS.filter((d) => values.days.includes(d.id)).map((d) => d.long.toLowerCase());
  const days =
    names.length <= 1 ? (names[0] ?? 'día') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
  const capitalised = days.charAt(0).toUpperCase() + days.slice(1);
  return `${capitalised} ${values.start} · ${LEVELS[values.level].label} · ${classroomLabel(values.classroom).replace('Aula ', '')}`;
}
