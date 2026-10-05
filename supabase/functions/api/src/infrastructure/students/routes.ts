import type { LocalDate } from '../../domain/common/mod.ts';
import type { StudentId } from '../../domain/students/mod.ts';
import {
  EndStudentEnrolments,
  EnrolStudent,
  MoveStudent,
  UnenrolStudent,
} from '../../application/classes/mod.ts';
import {
  type Enrolments,
  LinkSiblings,
  RegisterStudent,
  studentFilterFrom,
  type StudentInput,
  StudentNotFound,
  UnlinkSiblings,
  UpdateStudent,
  WithdrawStudent,
} from '../../application/students/mod.ts';
import { StudentsStudentStatus, today } from '../classes/routes.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlClassGroupRepository,
  SqlClassQuery,
  SqlEnrolmentRepository,
} from '../persistence/classes.ts';
import { SavepointTransactionRunner, type Sql } from '../persistence/sql.ts';
import { SqlStudentQuery, SqlStudentRepository } from '../persistence/students.ts';

/** Alumnado pide a Clases que inscriba o termine las inscripciones de un alumno. */
export class ClassesEnrolments implements Enrolments {
  constructor(
    private readonly sql: Sql,
    private readonly clock: ApiApp['deps']['clock'],
  ) {}

  async enrol(
    student: StudentId,
    groupIds: string[],
    confirmOverCapacity: boolean,
    from?: LocalDate,
  ): Promise<void> {
    const enrol = new EnrolStudent(
      new SqlClassGroupRepository(this.sql),
      new SqlEnrolmentRepository(this.sql),
      this.clock,
    );
    for (const groupId of groupIds) {
      await enrol.execute(student.value, groupId, confirmOverCapacity, from);
    }
  }

  endAll(student: StudentId, on: LocalDate): Promise<void> {
    return new EndStudentEnrolments(new SqlEnrolmentRepository(this.sql)).execute(
      student.value,
      on,
    );
  }
}

export function studentInput(body: JsonBody): StudentInput {
  return {
    fullName: body.requiredString('fullName'),
    birthDate: body.requiredString('birthDate'),
    nationalId: body.optionalString('nationalId'),
    contactEmail: body.optionalString('contactEmail'),
    guardians: body.objectList('guardians').map((g) => ({
      name: g.requiredString('name'),
      phone: g.requiredString('phone'),
    })),
    ownPhone: body.optionalString('ownPhone'),
    federationLicence: body.optionalString('federationLicence'),
    imageConsent: body.bool('imageConsent'),
  };
}

/** Rutas de alumnado: /api/admin/students */
export function registerStudentRoutes(api: ApiApp): void {
  registerDomainErrors({
    StudentNotFound: [404, 'not_found'],
    MissingContact: [422, 'missing_contact'],
  });
  const { clock } = api.deps;
  const students = (scope: RequestScope) => new SqlStudentRepository(scope.tx);
  const query = (scope: RequestScope) => new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx));
  const enrolments = (scope: RequestScope) => new ClassesEnrolments(scope.tx, clock);
  const transactions = (scope: RequestScope) => new SavepointTransactionRunner(scope.tx);

  api.defineRoute(
    { method: 'GET', path: '/api/admin/students', access: 'admin' },
    async (c, scope) => {
      const filter = studentFilterFrom(c.req.query('filter') ?? 'all');
      const search = c.req.query('q') ?? null;
      return c.json({
        items: await query(scope).list(filter, search, today(api)),
        total: await query(scope).total(),
      });
    },
  );

  api.defineRoute(
    { method: 'GET', path: '/api/admin/students/:id', access: 'admin' },
    async (c, scope) => {
      const detail = await query(scope).detail(param(c, 'id'), today(api));
      if (detail === null) throw new StudentNotFound();
      return c.json(detail);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/students', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const register = new RegisterStudent(
        students(scope),
        enrolments(scope),
        transactions(scope),
        clock,
      );
      const id = await register.execute(
        studentInput(body),
        body.stringList('groupIds'),
        body.stringList('siblingIds'),
        body.bool('confirmOverCapacity'),
      );
      return c.json({ id }, 201);
    },
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/admin/students/:id', access: 'admin' },
    async (c, scope) => {
      await new UpdateStudent(students(scope), clock).execute(
        param(c, 'id'),
        studentInput(await JsonBody.from(c.req.raw)),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/students/:id/withdrawal', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new WithdrawStudent(students(scope), enrolments(scope), transactions(scope), clock)
        .execute(param(c, 'id'), body.requiredString('date'));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/students/:id/siblings', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new LinkSiblings(students(scope), transactions(scope)).execute(
        param(c, 'id'),
        body.requiredString('siblingId'),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'DELETE', path: '/api/admin/students/:id/siblings/:siblingId', access: 'admin' },
    async (c, scope) => {
      await new UnlinkSiblings(students(scope), transactions(scope)).execute(
        param(c, 'id'),
        param(c, 'siblingId'),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/students/:id/enrolments', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const enrol = new EnrolStudent(
        new SqlClassGroupRepository(scope.tx),
        new SqlEnrolmentRepository(scope.tx),
        clock,
      );
      await enrol.execute(
        param(c, 'id'),
        body.requiredString('groupId'),
        body.bool('confirmOverCapacity'),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'DELETE', path: '/api/admin/students/:id/enrolments/:groupId', access: 'admin' },
    async (c, scope) => {
      const unenrol = new UnenrolStudent(
        new SqlEnrolmentRepository(scope.tx),
        new StudentsStudentStatus(scope.tx, today(api)),
        clock,
      );
      await unenrol.execute(param(c, 'id'), param(c, 'groupId'));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/students/:id/enrolments/:groupId/move', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const move = new MoveStudent(
        new SqlClassGroupRepository(scope.tx),
        new SqlEnrolmentRepository(scope.tx),
        clock,
        transactions(scope),
      );
      await move.execute(
        param(c, 'id'),
        param(c, 'groupId'),
        body.requiredString('toGroupId'),
        body.bool('confirmOverCapacity'),
      );
      return c.body(null, 204);
    },
  );
}
