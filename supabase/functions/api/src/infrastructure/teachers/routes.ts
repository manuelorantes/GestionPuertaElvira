import {
  ActivateTeacher,
  ChangeTeacherRate,
  DeactivateTeacher,
  RegisterTeacher,
  RenameTeacher,
  type TeacherAssignments,
} from '../../application/teachers/mod.ts';
import type { TeacherId } from '../../domain/teachers/mod.ts';
import { type ApiApp, param } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import { SqlClassGroupRepository } from '../persistence/classes.ts';
import { SavepointTransactionRunner, type Sql } from '../persistence/sql.ts';
import { SqlTeacherQuery, SqlTeacherRepository } from '../persistence/teachers.ts';

/** Profesorado pregunta a Clases cuántos grupos tiene un profesor. */
export class ClassesTeacherAssignments implements TeacherAssignments {
  constructor(private readonly sql: Sql) {}

  async groupCount(teacherId: TeacherId): Promise<number> {
    const groups = await new SqlClassGroupRepository(this.sql).all();
    return groups.filter((g) => g.details().teacher.value === teacherId.value).length;
  }
}

/** Rutas de profesorado: /api/admin/teachers */
export function registerTeacherRoutes(api: ApiApp): void {
  registerDomainErrors({
    TeacherNotFound: [404, 'not_found'],
    TeacherHasGroups: [409, 'teacher_has_groups'],
  });

  api.defineRoute(
    { method: 'GET', path: '/api/admin/teachers', access: 'admin' },
    async (c, scope) => {
      return c.json({ items: await new SqlTeacherQuery(scope.tx).all() });
    },
  );

  api.defineRoute(
    { method: 'POST', path: '/api/admin/teachers', access: 'admin' },
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      const id = await new RegisterTeacher(new SqlTeacherRepository(scope.tx)).execute(
        body.requiredString('fullName'),
      );
      return c.json({ id }, 201);
    },
  );

  api.defineRoute(
    { method: 'PUT', path: '/api/admin/teachers/:id', access: 'admin' },
    async (c, scope) => {
      const id = param(c, 'id');
      const body = await JsonBody.from(c.req.raw);
      const teachers = new SqlTeacherRepository(scope.tx);
      // Todo o nada: si la tarifa no es válida o no se puede desactivar, tampoco se cambia el nombre.
      await new SavepointTransactionRunner(scope.tx).run(async () => {
        await new RenameTeacher(teachers).execute(id, body.requiredString('fullName'));
        const rate = body.optionalString('hourlyRate');
        if (rate !== null) await new ChangeTeacherRate(teachers).execute(id, rate);
        if (body.bool('active', true)) {
          await new ActivateTeacher(teachers).execute(id);
        } else {
          await new DeactivateTeacher(teachers, new ClassesTeacherAssignments(scope.tx)).execute(
            id,
          );
        }
      });
      return c.body(null, 204);
    },
  );
}
