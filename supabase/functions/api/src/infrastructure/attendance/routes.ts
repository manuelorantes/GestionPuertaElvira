import { LocalDate } from '../../domain/common/mod.ts';
import {
  type ClassAssignments,
  TeacherClasses,
  TeacherStudents,
} from '../../application/attendance/mod.ts';
import { TeacherAgenda } from '../../application/payroll/mod.ts';
import { type ApiApp, type RequestScope, sessionTeacher } from '../http/app.ts';
import { SqlClassRoster, SqlTeacherRosterQuery } from '../persistence/attendance.ts';
import {
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlSubstitutionRepository,
  SqlTeacherRates,
} from '../persistence/payroll.ts';
import type { Sql } from '../persistence/sql.ts';

/** La agenda de nómina (horario, sustituciones y festivos) es quien sabe qué clase da cada profesor cada día. */
class PayrollClassAssignments implements ClassAssignments {
  constructor(private readonly sql: Sql) {}

  agenda(teacherId: string, from: string, to: string) {
    return new TeacherAgenda(
      new SqlScheduleDirectory(this.sql),
      new SqlDutyRepository(this.sql),
      new SqlSubstitutionRepository(this.sql),
      new SqlHolidayCalendar(this.sql),
    ).execute(teacherId, from, to);
  }
}

/** Espacio del profesorado: /api/teacher/* (el profesor sale siempre de la sesión, nunca de la URL). */
export function registerAttendanceRoutes(api: ApiApp): void {
  const teacher = (method: 'GET' | 'PUT', path: string) =>
    ({ method, path, access: 'teacher' }) as const;
  const today = () => LocalDate.fromInstant(api.deps.clock.now()).toString();
  const classes = (scope: RequestScope) =>
    new TeacherClasses(new PayrollClassAssignments(scope.tx), new SqlClassRoster(scope.tx));

  api.defineRoute(teacher('GET', '/api/teacher/me'), async (c, scope) => {
    const id = sessionTeacher(scope);
    const found = (await new SqlTeacherRates(scope.tx).all()).find((t) => t.id === id);
    return c.json({ teacher: { id, name: found?.name ?? '' } });
  });

  api.defineRoute(teacher('GET', '/api/teacher/classes'), async (c, scope) => {
    const from = c.req.query('from') ?? today();
    const to = c.req.query('to') ?? from;
    return c.json({ items: await classes(scope).execute(sessionTeacher(scope), from, to) });
  });

  api.defineRoute(teacher('GET', '/api/teacher/students'), async (c, scope) => {
    return c.json({
      items: await new TeacherStudents(new SqlTeacherRosterQuery(scope.tx), api.deps.clock).execute(
        sessionTeacher(scope),
      ),
    });
  });
}
