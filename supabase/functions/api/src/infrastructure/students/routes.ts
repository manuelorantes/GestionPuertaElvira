import { LocalDate } from '../../domain/common/mod.ts';
import type { StudentId } from '../../domain/students/mod.ts';
import {
  type AttendanceInput,
  ChangeAttendance,
  ChangeEnrolmentStart,
  EndStudentEnrolments,
  EnrolStudent,
  MoveStudent,
  UnenrolStudent,
} from '../../application/classes/mod.ts';
import {
  ChangeJoinDate,
  type EnrolmentRequest,
  type Enrolments,
  LinkSiblings,
  ListPendingData,
  type Membership,
  RegisterStudent,
  RejoinStudent,
  RenumberMembers,
  studentFilterFrom,
  type StudentInput,
  StudentNotFound,
  UnlinkSiblings,
  UpdateStudent,
  WithdrawStudent,
} from '../../application/students/mod.ts';
import { StudentsJoinDates, StudentsStudentStatus, today } from '../classes/routes.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { generatingCharges, recalculatingFees } from '../billing/recalculate.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlClassGroupRepository,
  SqlClassQuery,
  SqlEnrolmentRepository,
} from '../persistence/classes.ts';
import { SavepointTransactionRunner, type Sql } from '../persistence/sql.ts';
import { SqlStudentAccountRepository } from '../persistence/billing.ts';
import {
  SqlMemberNumbers,
  SqlStudentQuery,
  SqlStudentRepository,
} from '../persistence/students.ts';
import { StudentAccount, StudentRef } from '../../domain/billing/mod.ts';

/** `enrolments` (grupo + horario especial) o, más simple, `groupIds` (grupos completos). */
function enrolmentRequests(body: JsonBody): EnrolmentRequest[] {
  return [
    ...body.stringList('groupIds').map((groupId) => ({ groupId, attendance: null })),
    ...body.objectList('enrolments').map((e) => ({
      groupId: e.requiredString('groupId'),
      attendance: attendanceInput(e),
    })),
  ];
}

/** Alumnado pide a Clases que inscriba o termine las inscripciones de un alumno. */
export class ClassesEnrolments implements Enrolments {
  constructor(
    private readonly sql: Sql,
    private readonly clock: ApiApp['deps']['clock'],
  ) {}

  async enrol(
    student: StudentId,
    requests: EnrolmentRequest[],
    confirmOverCapacity: boolean,
    from?: LocalDate,
  ): Promise<void> {
    const enrol = new EnrolStudent(
      new SqlClassGroupRepository(this.sql),
      new SqlEnrolmentRepository(this.sql),
      this.clock,
    );
    for (const request of requests) {
      await enrol.execute(
        student.value,
        request.groupId,
        confirmOverCapacity,
        from,
        request.attendance,
      );
    }
  }

  async currentStarts(student: StudentId, since: LocalDate): Promise<LocalDate[]> {
    const rows = await this.sql`SELECT enrolled_on::text AS start FROM classes_enrolment
      WHERE student_id = ${student.value} AND (ends_on IS NULL OR ends_on > ${since.toString()})`;
    return rows.map((r) => LocalDate.fromString(String(r.start)));
  }

  async moveStarts(student: StudentId, from: LocalDate, to: LocalDate): Promise<void> {
    await this.sql`UPDATE classes_enrolment SET enrolled_on = ${to.toString()}
      WHERE student_id = ${student.value} AND enrolled_on = ${from.toString()}
        AND (ends_on IS NULL OR ends_on > ${to.toString()})`;
  }

  endAll(student: StudentId, on: LocalDate): Promise<void> {
    return new EndStudentEnrolments(new SqlEnrolmentRepository(this.sql)).execute(
      student.value,
      on,
    );
  }
}

/** Alumnado pide a Cobros que marque como socio a quien entra sin clases. */
export class BillingMembership implements Membership {
  constructor(private readonly sql: Sql) {}

  async makeMember(student: StudentId): Promise<void> {
    const accounts = new SqlStudentAccountRepository(this.sql);
    const ref = StudentRef.fromString(student.value);
    const account = (await accounts.account(ref)) ?? StudentAccount.open(ref);
    if (!account.isMember()) {
      account.update(account.preferredPlan(), true, account.privateRate());
      await accounts.saveAccount(account);
    }
  }
}

/** Horario especial opcional: { days?: ['mon'], start?: '18:30', end?: '19:00' }. */
function attendanceInput(body: JsonBody): AttendanceInput | null {
  const raw = body.optionalObject('attendance');
  if (raw === null) return null;
  // Sin «days» (o vacío) se entiende «todos los días del grupo».
  const days = raw.stringList('days');
  return {
    days: days.length === 0 ? null : days,
    start: raw.optionalString('start'),
    end: raw.optionalString('end'),
  };
}

export function studentInput(body: JsonBody): StudentInput {
  return {
    fullName: body.requiredString('fullName'),
    birthDate: body.optionalString('birthDate'),
    nationalId: body.optionalString('nationalId'),
    contactEmail: body.optionalString('contactEmail'),
    guardians: body.objectList('guardians').map((g) => ({
      name: g.requiredString('name'),
      phone: g.optionalString('phone'),
    })),
    ownPhone: body.optionalString('ownPhone'),
    federationLicence: body.optionalString('federationLicence'),
    imageConsent: body.bool('imageConsent'),
  };
}

/** Rutas de alumnado: /api/admin/students */
export function registerStudentRoutes(api: ApiApp): void {
  registerDomainErrors({ StudentNotFound: [404, 'not_found'] });
  const { clock } = api.deps;
  const students = (scope: RequestScope) => new SqlStudentRepository(scope.tx);
  const query = (scope: RequestScope) => new SqlStudentQuery(scope.tx, new SqlClassQuery(scope.tx));
  const enrolments = (scope: RequestScope) => new ClassesEnrolments(scope.tx, clock);
  const transactions = (scope: RequestScope) => new SavepointTransactionRunner(scope.tx);

  api.defineRoute(
    { method: 'GET', path: '/api/admin/students', access: 'clubReader' },
    async (c, scope) => {
      const filter = studentFilterFrom(c.req.query('filter') ?? 'all');
      const search = c.req.query('q') ?? null;
      return c.json({
        items: await query(scope).list(filter, search, today(api)),
        total: await query(scope).total(),
      });
    },
  );

  // Antes de /:id para que «member-numbers» no se tome por un identificador.
  api.defineRoute(
    { method: 'PUT', path: '/api/admin/students/member-numbers', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new RenumberMembers(new SqlMemberNumbers(scope.tx)).execute(
        body.objectList('assignments').map((a) => ({
          studentId: a.requiredString('studentId'),
          memberNumber: a.requiredInt('memberNumber'),
        })),
      );
      return c.body(null, 204);
    },
  );

  // Antes de /:id para que «pending-data» no se tome por un identificador.
  api.defineRoute(
    { method: 'GET', path: '/api/admin/students/pending-data', access: 'admin' },
    async (c, scope) => {
      const items = await new ListPendingData(students(scope), clock).execute();
      return c.json({ items });
    },
  );

  api.defineRoute(
    { method: 'GET', path: '/api/admin/students/:id', access: 'clubReader' },
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
        new BillingMembership(scope.tx),
      );
      const requested = enrolmentRequests(body);
      // Su familia directa pasa a tener descuento familiar.
      const id = await recalculatingFees(
        api,
        scope,
        body.stringList('siblingIds'),
        () =>
          register.execute(
            studentInput(body),
            requested,
            body.stringList('siblingIds'),
            body.bool('confirmOverCapacity'),
            body.optionalString('joinedOn'),
          ),
      );
      // Su cuota de este mes, al momento.
      await generatingCharges(api, scope, [id]);
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
    { method: 'POST', path: '/api/admin/students/:id/rejoin', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const id = param(c, 'id');
      await recalculatingFees(api, scope, [id], () =>
        new RejoinStudent(
          students(scope),
          enrolments(scope),
          transactions(scope),
          clock,
          new BillingMembership(scope.tx),
        ).execute(
          id,
          body.requiredString('date'),
          enrolmentRequests(body),
          body.bool('confirmOverCapacity'),
        ));
      await generatingCharges(api, scope, [id]);
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/admin/students/:id/joined-on', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const id = param(c, 'id');
      await recalculatingFees(
        api,
        scope,
        [id],
        () =>
          new ChangeJoinDate(students(scope), enrolments(scope), clock).execute(
            id,
            body.requiredString('date'),
          ),
      );
      await generatingCharges(api, scope, [id]);
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
      await recalculatingFees(
        api,
        scope,
        [param(c, 'id'), body.requiredString('siblingId')],
        () =>
          new LinkSiblings(students(scope), transactions(scope)).execute(
            param(c, 'id'),
            body.requiredString('siblingId'),
          ),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'DELETE', path: '/api/admin/students/:id/siblings/:siblingId', access: 'admin' },
    async (c, scope) => {
      await recalculatingFees(
        api,
        scope,
        [param(c, 'id'), param(c, 'siblingId')],
        () =>
          new UnlinkSiblings(students(scope), transactions(scope)).execute(
            param(c, 'id'),
            param(c, 'siblingId'),
          ),
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
        new StudentsJoinDates(scope.tx),
      );
      // `from`: desde qué día está en el grupo (por defecto hoy).
      const from = body.optionalString('from');
      await recalculatingFees(api, scope, [param(c, 'id')], () =>
        enrol.execute(
          param(c, 'id'),
          body.requiredString('groupId'),
          body.bool('confirmOverCapacity'),
          from ? LocalDate.fromString(from) : undefined,
          attendanceInput(body),
        ));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    {
      method: 'PUT',
      path: '/api/admin/students/:id/enrolments/:groupId/start',
      access: 'admin',
    },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await recalculatingFees(api, scope, [param(c, 'id')], () =>
        new ChangeEnrolmentStart(
          new SqlEnrolmentRepository(scope.tx),
          new StudentsJoinDates(scope.tx),
          clock,
        ).execute(param(c, 'id'), param(c, 'groupId'), body.requiredString('from')));
      return c.body(null, 204);
    },
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/admin/students/:id/enrolments/:groupId', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await recalculatingFees(api, scope, [param(c, 'id')], () =>
        new ChangeAttendance(
          new SqlClassGroupRepository(scope.tx),
          new SqlEnrolmentRepository(scope.tx),
          clock,
        ).execute(
          param(c, 'id'),
          param(c, 'groupId'),
          attendanceInput(body),
          body.bool('confirmOverCapacity'),
        ));
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
      await recalculatingFees(
        api,
        scope,
        [param(c, 'id')],
        () => unenrol.execute(param(c, 'id'), param(c, 'groupId')),
      );
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
      await recalculatingFees(api, scope, [param(c, 'id')], () =>
        move.execute(
          param(c, 'id'),
          param(c, 'groupId'),
          body.requiredString('toGroupId'),
          body.bool('confirmOverCapacity'),
          attendanceInput(body),
        ));
      return c.body(null, 204);
    },
  );
}
