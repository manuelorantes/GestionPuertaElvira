import { InvalidValue, LocalDate } from '../../domain/common/mod.ts';
import {
  ActivityProgress,
  type ClassAssignments,
  type ClassOnDay,
  ConfirmActivity,
  ConfirmWithoutRollCall,
  type FridayAttendance,
  GroupAttendance,
  MarkFridayAsManager,
  MarkShiftDone,
  MissedRollCalls,
  OpenFridayList,
  OpenRollCall,
  type SessionRecorder,
  StudentAttendance,
  TakeRollCall,
  TeacherClasses,
  TeacherStudents,
} from '../../application/attendance/mod.ts';
import {
  ListSettlements,
  RecordScheduledSession,
  TeacherAgenda,
  TeacherPayStatus,
} from '../../application/payroll/mod.ts';
import { type ApiApp, param, type RequestScope, sessionTeacher } from '../http/app.ts';
import { httpError } from '../http/errors.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlActivityCheckRepository,
  SqlClassRoster,
  SqlFridayRoster,
  SqlGroupAttendanceQuery,
  SqlMissedRollCallQuery,
  SqlStudentAttendanceQuery,
  SqlTeacherRosterQuery,
} from '../persistence/attendance.ts';
import {
  SqlAdvanceRepository,
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlSubstitutionRepository,
  SqlTeacherRates,
  SqlTimesheetRepository,
} from '../persistence/payroll.ts';
import { SqlRollCallRepository } from '../persistence/rollcalls.ts';
import type { Sql } from '../persistence/sql.ts';
import { MarkFriday } from '../../application/points/mod.ts';
import type { Clock, LocalDate as Day } from '../../domain/common/mod.ts';
import { SqlPointMovementRepository, SqlPointsStudents } from '../persistence/points.ts';

/** La asistencia de los viernes de los puntos: la lista sale de los movimientos y marcar usa el caso de uso de Puntos. */
class PointsFridayAttendance implements FridayAttendance {
  private readonly roster: SqlFridayRoster;

  constructor(private readonly sql: Sql, private readonly clock: Clock) {
    this.roster = new SqlFridayRoster(sql);
  }

  markedByTeacher(teacherId: string, date: Day) {
    return this.roster.markedByTeacher(teacherId, date);
  }

  proposed(date: Day) {
    return this.roster.proposed(date);
  }

  presentOn(date: Day) {
    return this.roster.presentOn(date);
  }

  everyone(date: Day) {
    return this.roster.everyone(date);
  }

  mark(student: string, date: Day, present: boolean, user: string | null) {
    return new MarkFriday(
      new SqlPointMovementRepository(this.sql),
      new SqlPointsStudents(this.sql),
      this.clock,
    ).execute(student, date.toString(), present, user);
  }
}

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

/** Apunta la sesión de una clase o actividad en las horas de nómina en cuanto su profesor la pasa o la confirma. */
class PayrollSessionRecorder implements SessionRecorder {
  constructor(private readonly sql: Sql) {}

  record(item: ClassOnDay): Promise<void> {
    const source = item.groupId !== null ? `group:${item.groupId}` : `duty:${item.dutyId}`;
    return new RecordScheduledSession(
      new SqlScheduleDirectory(this.sql),
      new SqlDutyRepository(this.sql),
      new SqlSubstitutionRepository(this.sql),
      new SqlHolidayCalendar(this.sql),
      new SqlTimesheetRepository(this.sql),
      new SqlSettlementRepository(this.sql),
    ).execute(source, item.date);
  }
}

/** Espacio del profesorado: /api/teacher/* (el profesor sale siempre de la sesión, nunca de la URL). */
export function registerAttendanceRoutes(api: ApiApp): void {
  registerDomainErrors({
    ClassNotGiven: [404, 'not_found'],
    AttendanceGroupNotFound: [404, 'not_found'],
    RollCallNotOpenYet: [409, 'roll_call_not_open'],
    RollCallClosed: [409, 'roll_call_closed'],
    RollCallStillOpen: [409, 'roll_call_still_open'],
  });
  const teacher = (method: 'GET' | 'PUT' | 'POST', path: string) =>
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

  const fridays = (scope: RequestScope) => new PointsFridayAttendance(scope.tx, api.deps.clock);
  const checks = (scope: RequestScope) => new SqlActivityCheckRepository(scope.tx);
  const progress = (scope: RequestScope) => new ActivityProgress(checks(scope), fridays(scope));

  api.defineRoute(teacher('GET', '/api/teacher/me'), async (c, scope) => {
    const id = sessionTeacher(scope);
    const found = (await new SqlTeacherRates(scope.tx).all()).find((t) => t.id === id);
    return c.json({ teacher: { id, name: found?.name ?? '' } });
  });

  api.defineRoute(teacher('GET', '/api/teacher/classes'), async (c, scope) => {
    const from = c.req.query('from') ?? today();
    const to = c.req.query('to') ?? from;
    return c.json({
      items: await new TeacherClasses(...ports(scope), progress(scope)).execute(
        sessionTeacher(scope),
        from,
        to,
      ),
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
    await new TakeRollCall(...ports(scope), new PayrollSessionRecorder(scope.tx)).execute(
      sessionTeacher(scope),
      param(c, 'groupId'),
      param(c, 'date'),
      body.stringList('absent'),
    );
    return c.body(null, 204);
  });

  api.defineRoute(teacher('GET', '/api/teacher/pay'), async (c, scope) => {
    const season = c.req.query('season');
    if (season !== undefined && !/^\d{4}$/.test(season)) {
      throw new InvalidValue('season', 'Indica la temporada con el año en que empieza.');
    }
    const tx = scope.tx;
    const teachers = new SqlTeacherRates(tx);
    const settlements = new ListSettlements(
      new SqlTimesheetRepository(tx),
      new SqlSettlementRepository(tx),
      teachers,
      new SqlAdvanceRepository(tx),
    );
    return c.json(
      await new TeacherPayStatus(teachers, settlements, api.deps.clock).execute(
        sessionTeacher(scope),
        season === undefined ? null : Number(season),
      ),
    );
  });

  // ---- Actividades del club ---------------------------------------------------------------------
  api.defineRoute(
    teacher('POST', '/api/teacher/activities/:dutyId/:date/done'),
    async (c, scope) => {
      await new MarkShiftDone(
        new PayrollClassAssignments(scope.tx),
        checks(scope),
        api.deps.clock,
        new PayrollSessionRecorder(scope.tx),
      ).execute(sessionTeacher(scope), param(c, 'dutyId'), param(c, 'date'));
      return c.body(null, 204);
    },
  );

  api.defineRoute(teacher('GET', '/api/teacher/fridays/:dutyId/:date'), async (c, scope) => {
    return c.json(
      await new OpenFridayList(
        new PayrollClassAssignments(scope.tx),
        fridays(scope),
        progress(scope),
        api.deps.clock,
      ).execute(sessionTeacher(scope), param(c, 'dutyId'), param(c, 'date')),
    );
  });

  api.defineRoute(
    teacher('PUT', '/api/teacher/fridays/:dutyId/:date/students/:studentId'),
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new MarkFridayAsManager(
        new PayrollClassAssignments(scope.tx),
        fridays(scope),
        api.deps.clock,
        new PayrollSessionRecorder(scope.tx),
      ).execute(
        sessionTeacher(scope),
        scope.user?.id ?? null,
        param(c, 'dutyId'),
        param(c, 'date'),
        param(c, 'studentId'),
        body.bool('present'),
      );
      return c.body(null, 204);
    },
  );

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

  api.defineRoute(
    { method: 'GET', path: '/api/admin/attendance/groups/:groupId', access: 'admin' },
    async (c, scope) => {
      return c.json(
        await new GroupAttendance(new SqlGroupAttendanceQuery(scope.tx), api.deps.clock)
          .execute(param(c, 'groupId'), c.req.query('month') ?? ''),
      );
    },
  );

  api.defineRoute(
    { method: 'GET', path: '/api/admin/students/:id/attendance', access: 'admin' },
    async (c, scope) => {
      return c.json(
        await new StudentAttendance(new SqlStudentAttendanceQuery(scope.tx), api.deps.clock)
          .execute(param(c, 'id')),
      );
    },
  );

  api.defineRoute(
    {
      method: 'POST',
      path: '/api/admin/attendance/pending/activities/:dutyId/:date/confirm',
      access: 'admin',
    },
    async (c, scope) => {
      if (scope.user === null) throw httpError(401);
      await new ConfirmActivity(checks(scope), api.deps.clock).execute(
        param(c, 'dutyId'),
        param(c, 'date'),
        scope.user.id,
      );
      return c.body(null, 204);
    },
  );
}
