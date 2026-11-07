import type { ClassGroup, Classroom } from './api';
import { groupsOn, toMinutes, WEEKDAYS, WHOLE_WEEK } from './schedule';

/** Un aula dentro de un día: desde qué columna empieza y cuántas ocupa (una por grupo que coincide a la vez). */
interface ClassroomColumns {
  classroom: Classroom;
  firstColumn: number;
  span: number;
}

export interface DayColumns {
  day: (typeof WHOLE_WEEK)[number];
  classrooms: ClassroomColumns[];
  columnCount: number;
  /** Columna (desde 1) de cada grupo del día, por id. */
  columnOf: Map<string, number>;
}

/** Reparte los grupos de un aula en carriles: cada uno va al primero que esté libre a su hora. */
function lanesOf(groups: ClassGroup[]): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  const byStart = [...groups].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (const group of byStart) {
    const free = laneEnds.findIndex((end) => end <= toMinutes(group.start));
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = toMinutes(group.end);
    lanes.set(group.id, lane);
  }
  return lanes;
}

function dayColumns(
  day: DayColumns['day'],
  groups: ClassGroup[],
  classrooms: readonly Classroom[],
  keepEmpty: boolean,
): DayColumns {
  const onDay = groupsOn(day.id, groups);
  const columnOf = new Map<string, number>();
  const columns: ClassroomColumns[] = [];
  let next = 1;
  for (const classroom of classrooms) {
    const lanes = lanesOf(onDay.filter((g) => g.classroom === classroom));
    if (lanes.size === 0 && !keepEmpty) continue;
    const span = Math.max(1, ...[...lanes.values()].map((lane) => lane + 1));
    for (const [id, lane] of lanes) columnOf.set(id, next + lane);
    columns.push({ classroom, firstColumn: next, span });
    next += span;
  }
  return { day, classrooms: columns, columnCount: next - 1, columnOf };
}

/**
 * Días y columnas del horario de todas las aulas. Un aula vacía todo un día no ocupa columna y un día sin
 * ningún aula ocupada desaparece; si no hay ningún grupo que mostrar, se ven todos los días vacíos. Los grupos
 * que coinciden en aula y hora van uno al lado del otro, bajo una sola cabecera del aula.
 */
export function allClassroomsColumns(
  groups: ClassGroup[],
  classrooms: readonly Classroom[],
): DayColumns[] {
  const days = WEEKDAYS.map((day) => dayColumns(day, groups, classrooms, false)).filter(
    ({ columnCount }) => columnCount > 0,
  );
  return days.length > 0 ? days : WEEKDAYS.map((day) => dayColumns(day, groups, classrooms, true));
}

/** Días y columnas del horario de un aula: de lunes a domingo, aunque algún día esté vacío. */
export function classroomWeekColumns(groups: ClassGroup[], classroom: Classroom): DayColumns[] {
  return WHOLE_WEEK.map((day) => dayColumns(day, groups, [classroom], true));
}
