import { LocalDate } from '../../domain/common/mod.ts';
import { StudentId } from '../../domain/students/mod.ts';
import { TeacherId } from '../../domain/teachers/mod.ts';
import type { StudentReference, TeacherReference } from '../../domain/classes/mod.ts';
import {
  ClassGroupNotFound,
  CreateClassGroup,
  type GroupInput,
  type GroupSummary,
  ResolveSchedule,
  type StudentJoinDates,
  type StudentStatus,
  type TeacherDirectory,
  UpdateClassGroup,
} from '../../application/classes/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlClassGroupRepository, SqlClassQuery } from '../persistence/classes.ts';
import type { Sql } from '../persistence/sql.ts';
import { SqlStudentRepository } from '../persistence/students.ts';
import { SqlTeacherRepository } from '../persistence/teachers.ts';
import { recalculatingGroupFees } from '../billing/recalculate.ts';

/** Clases pregunta a Profesorado si un profesor está activo. */
export class TeachersTeacherDirectory implements TeacherDirectory {
  constructor(private readonly sql: Sql) {}

  async isActive(teacher: TeacherReference): Promise<boolean> {
    const found = await new SqlTeacherRepository(this.sql).find(
      TeacherId.fromString(teacher.value),
    );
    return found?.isActive() ?? false;
  }
}

/** Clases pregunta a Alumnado si un alumno sigue activo hoy. */
export class StudentsStudentStatus implements StudentStatus {
  constructor(
    private readonly sql: Sql,
    private readonly today: LocalDate,
  ) {}

  async isActive(student: StudentReference): Promise<boolean> {
    const found = await new SqlStudentRepository(this.sql).find(
      StudentId.fromString(student.value),
    );
    return found?.isActiveOn(this.today) ?? false;
  }
}

/** Clases pregunta a Alumnado desde cuándo está de alta un alumno (su alta en curso). */
export class StudentsJoinDates implements StudentJoinDates {
  constructor(private readonly sql: Sql) {}

  async joinedOn(student: StudentReference): Promise<LocalDate | null> {
    const found = await new SqlStudentRepository(this.sql).find(
      StudentId.fromString(student.value),
    );
    return found?.joinedOn ?? null;
  }
}

export function groupInput(body: JsonBody): GroupInput {
  return {
    name: body.optionalString('name'),
    level: body.requiredString('level'),
    teacherId: body.requiredString('teacherId'),
    days: body.stringList('days'),
    start: body.requiredString('start'),
    end: body.requiredString('end'),
    classroom: body.requiredString('classroom'),
    capacity: body.requiredInt('capacity'),
  };
}

function present(group: GroupSummary) {
  return {
    id: group.id,
    name: group.name,
    customName: group.customName,
    level: group.level,
    teacher: { id: group.teacherId, fullName: group.teacherName },
    days: group.days,
    start: group.start,
    end: group.end,
    slotLabel: group.slotLabel,
    classroom: group.classroom,
    capacity: group.capacity,
    occupied: group.occupied,
    occupancyByDay: group.occupancyByDay,
    weeklyPlan: group.weeklyPlan,
  };
}

export function today(api: ApiApp): LocalDate {
  return LocalDate.fromInstant(api.deps.clock.now());
}

/** Rutas de clases: /api/admin/groups */
export function registerClassRoutes(api: ApiApp): void {
  // Traduce el horario que hará un alumno a grupos, para el alta.
  api.defineRoute(
    { method: 'POST', path: '/api/admin/groups/resolve-schedule', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const blocks = body.objectList('blocks').map((b) => ({
        day: b.requiredString('day'),
        start: b.requiredString('start'),
        end: b.requiredString('end'),
        classroom: b.optionalString('classroom'),
      }));
      return c.json(
        await new ResolveSchedule(new SqlClassGroupRepository(scope.tx)).execute(blocks),
      );
    },
  );

  registerDomainErrors({
    ClassGroupNotFound: [404, 'not_found'],
    ClassroomConflict: [409, 'classroom_conflict'],
    TeacherNotAvailable: [422, 'teacher_not_available'],
    GroupFull: [409, 'group_full'],
    StudentScheduleOverlap: [409, 'schedule_overlap'],
    AlreadyEnrolled: [409, 'already_enrolled'],
    NotEnrolled: [404, 'not_enrolled'],
    LastEnrolment: [409, 'last_enrolment'],
  });
  const query = (scope: RequestScope) => new SqlClassQuery(scope.tx);

  api.defineRoute(
    { method: 'GET', path: '/api/admin/groups', access: 'clubReader' },
    async (c, scope) => {
      return c.json({ items: (await query(scope).groups(today(api))).map(present) });
    },
  );

  api.defineRoute(
    { method: 'GET', path: '/api/admin/groups/:id', access: 'clubReader' },
    async (c, scope) => {
      const id = param(c, 'id');
      const group = await query(scope).group(id, today(api));
      if (group === null) throw new ClassGroupNotFound();
      return c.json({
        ...present(group),
        students: await query(scope).enrolledStudents(id, today(api)),
      });
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/groups', access: 'admin' },
    async (c, scope) => {
      const create = new CreateClassGroup(
        new SqlClassGroupRepository(scope.tx),
        new TeachersTeacherDirectory(scope.tx),
      );
      return c.json({ id: await create.execute(groupInput(await JsonBody.from(c.req.raw))) }, 201);
    },
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/admin/groups/:id', access: 'admin' },
    async (c, scope) => {
      const update = new UpdateClassGroup(
        new SqlClassGroupRepository(scope.tx),
        new TeachersTeacherDirectory(scope.tx),
      );
      const input = groupInput(await JsonBody.from(c.req.raw));
      await recalculatingGroupFees(
        api,
        scope,
        param(c, 'id'),
        () => update.execute(param(c, 'id'), input),
      );
      return c.body(null, 204);
    },
  );
}
