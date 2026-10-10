import { classroomLabel } from '@/features/classes/classrooms';
import { WEEKDAYS } from '@/features/classes/schedule';

import type { TeacherGroup } from './api';

/** «Lun, Mié». */
export const daysLabel = (days: string[]) =>
  days.map((d) => WEEKDAYS.find((w) => w.id === d)?.short ?? d).join(', ');

/** «Lun, Mié · 17:00–18:00 · Aula Alfil · 2 alumnos». */
export const groupLine = (group: TeacherGroup) =>
  `${daysLabel(group.days)} · ${group.start}–${group.end} · ${classroomLabel(group.classroom)} · ${
    group.students.length
  } ${group.students.length === 1 ? 'alumno' : 'alumnos'}`;

/** Primer mes de la temporada en curso (septiembre; en julio y agosto, el de la que acaba de terminar). */
export const seasonFirstMonth = (month: string) => {
  const year = Number(month.slice(0, 4));
  return Number(month.slice(5, 7)) >= 9 ? `${year}-09` : `${year - 1}-09`;
};

/** Porcentaje de asistencia, o null sin clases con lista. */
export const attendancePercent = (s: { attended: number; classes: number }) =>
  s.classes === 0 ? null : Math.round((s.attended / s.classes) * 100);
