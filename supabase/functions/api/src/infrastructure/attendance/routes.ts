import { LocalDate } from '../../domain/common/mod.ts';
import {
  type ClassAssignments,
  ConfirmWithoutRollCall,
  MissedRollCalls,
  OpenRollCall,
  TakeRollCall,
  TeacherClasses,
  TeacherStudents,
} from '../../application/attendance/mod.ts';
import { TeacherAgenda } from '../../application/payroll/mod.ts';
import { type ApiApp, param, type RequestScope, sessionTeacher } from '../http/app.ts';
import { httpError } from '../http/errors.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlClassRoster,
  SqlMissedRollCallQuery,
  SqlTeacherRosterQuery,
} from '../persistence/attendance.ts';
import {
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlSubstitutionRepository,
  SqlTeacherRates,
} from '../persistence/payroll.ts';
import { SqlRollCallRepository } from '../persistence/rollcalls.ts';
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
  registerDomainErrors({
    ClassNotGiven: [404, 'not_found'],
    RollCallNotOpenYet: [409, 'roll_call_not_open'],
    RollCallClosed: [409, 'roll_call_closed'],
    RollCallStillOpen: [409, 'roll_call_still_open'],
  });
  const teacher = (method: 'GET' | 'PUT', path: string) =>
    ({ method, path, access: 'teacher' }) as const;
  const today = () => LocalDate.fromInstant(api.deps.clock.now()).toString();
  /** Los casos de uso del profesorado comparten agenda, lista de alumnos del día, listas y reloj. */
  const ports = (scope: RequestScope) =>
    [
      new PayrollClassAssignments(scope.tx),
      new SqlClassRoster(scope.tx),
      new SqlRollCallRepository(scope.tx),
      api.deps.clock,
    ] as const;

  api.defineRoute(teacher('GET', '/api/teacher/me'), async (c, scope) => {
    const id = sessionTeacher(scope);
    const found = (await new SqlTeacherRates(scope.tx).all()).find((t) => t.id === id);
    return c.json({ teacher: { id, name: found?.name ?? '' } });
  });

  api.defineRoute(teacher('GET', '/api/teacher/classes'), async (c, scope) => {
    const from = c.req.query('from') ?? today();
    const to = c.req.query('to') ?? from;
    return c.json({
      items: await new TeacherClasses(...ports(scope)).execute(sessionTeacher(scope), from, to),
    });
  });

  api.defineRoute(teacher('GET', '/api/teacher/students'), async (c, scope) => {
    return c.json({
      items: await new TeacherStudents(new SqlTeacherRosterQuery(scope.tx), api.deps.clock).execute(
        sessionTeacher(scope),
      ),
    });
  });

  api.defineRoute(teacher('GET', '/api/teacher/roll-calls/:groupId/:date'), async (c, scope) => {
    return c.json(
      await new OpenRollCall(...ports(scope)).execute(
        sessionTeacher(scope),
        param(c, 'groupId'),
        param(c, 'date'),
      ),
    );
  });

  api.defineRoute(teacher('PUT', '/api/teacher/roll-calls/:groupId/:date'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new TakeRollCall(...ports(scope)).execute(
      sessionTeacher(scope),
      param(c, 'groupId'),
      param(c, 'date'),
      body.stringList('absent'),
    );
    return c.body(null, 204);
  });

  // ---- Administración: listas sin pasar ---------------------------------------------------------
  api.defineRoute(
    { method: 'GET', path: '/api/admin/attendance/pending', access: 'admin' },
    async (c, scope) => {
      return c.json({
        items: await new MissedRollCalls(new SqlMissedRollCallQuery(scope.tx), api.deps.clock)
          .execute(),
      });
    },
  );

  api.defineRoute(
    {
      method: 'POST',
      path: '/api/admin/attendance/pending/:groupId/:date/confirm',
      access: 'admin',
    },
    async (c, scope) => {
      if (scope.user === null) throw httpError(401);
      await new ConfirmWithoutRollCall(new SqlRollCallRepository(scope.tx), api.deps.clock).execute(
        param(c, 'groupId'),
        param(c, 'date'),
        scope.user.id,
      );
      return c.body(null, 204);
    },
  );
}
