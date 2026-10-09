import { InvalidValue, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import type { PointsKind } from '../../domain/points/mod.ts';
import {
  AdjustPointsByHand,
  DeleteTournament,
  fridaysOf,
  MarkFriday,
  MarkTournamentPhoto,
  SaveTournament,
  TournamentNotFound,
} from '../../application/points/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlPointMovementRepository,
  SqlPointsQuery,
  SqlPointsStudents,
  SqlTournamentRepository,
} from '../persistence/points.ts';

const KINDS: readonly PointsKind[] = ['friday', 'tournament', 'manual', 'redemption'];

/** Sección Puntos (administración): /api/admin/points/* */
export function registerPointsRoutes(api: ApiApp): void {
  registerDomainErrors({
    PointsAlreadySpent: [409, 'points_already_spent'],
    PointsStudentNotFound: [404, 'not_found'],
    TournamentNotFound: [404, 'not_found'],
    TournamentHasPhotos: [409, 'tournament_has_photos'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) =>
    ({ method, path, access: 'admin' }) as const;
  const { clock } = api.deps;
  const today = () => LocalDate.fromInstant(clock.now());
  const movements = (scope: RequestScope) => new SqlPointMovementRepository(scope.tx);
  const students = (scope: RequestScope) => new SqlPointsStudents(scope.tx);
  const tournaments = (scope: RequestScope) => new SqlTournamentRepository(scope.tx);
  const query = (scope: RequestScope) => new SqlPointsQuery(scope.tx, today);
  const by = (scope: RequestScope) => scope.user?.id ?? null;
  const monthOf = (value: string | undefined) =>
    value ? YearMonth.fromString(value) : YearMonth.of(today());
  const seasonOf = (month: YearMonth) => Season.containing(month);

  api.defineRoute(admin('GET', '/api/admin/points/students'), async (c, scope) => {
    const month = monthOf(c.req.query('month'));
    const season = seasonOf(month);
    return c.json({
      month: month.toString(),
      items: await query(scope).students(
        month,
        season.firstMonth().firstDay(),
        season.lastMonth().lastDay(),
      ),
    });
  });

  api.defineRoute(admin('GET', '/api/admin/points/movements'), async (c, scope) => {
    const month = c.req.query('month');
    const kind = c.req.query('kind') ?? null;
    if (kind !== null && !KINDS.includes(kind as PointsKind)) {
      throw new InvalidValue('kind', 'Tipo de movimiento desconocido.');
    }
    const student = c.req.query('student') ?? null;
    // Sin mes: los de la temporada en curso (p. ej. el historial de un alumno).
    const season = seasonOf(monthOf(undefined));
    const period = month ? YearMonth.fromString(month) : null;
    return c.json({
      items: await query(scope).movements(
        period?.firstDay() ?? season.firstMonth().firstDay(),
        period?.lastDay() ?? season.lastMonth().lastDay(),
        { kind: kind as PointsKind | null, student },
      ),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/points/adjustments'), async (c, scope) => {
    const body = await JsonBody.from(c.req.raw);
    await new AdjustPointsByHand(movements(scope), students(scope), clock).execute(
      body.requiredString('studentId'),
      body.requiredInt('delta'),
      body.optionalString('note') ?? '',
      by(scope),
    );
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/points/fridays'), async (c, scope) => {
    const month = monthOf(c.req.query('month'));
    return c.json({
      month: month.toString(),
      ...(await query(scope).fridays(month, fridaysOf(month))),
    });
  });

  api.defineRoute(
    admin('PUT', '/api/admin/points/fridays/:date/students/:id'),
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new MarkFriday(movements(scope), students(scope), clock).execute(
        param(c, 'id'),
        param(c, 'date'),
        body.bool('present'),
        by(scope),
      );
      return c.body(null, 204);
    },
  );

  api.defineRoute(admin('GET', '/api/admin/points/tournaments'), async (c, scope) => {
    const season = seasonOf(monthOf(c.req.query('month')));
    return c.json({
      items: await query(scope).tournaments(
        season.firstMonth().firstDay(),
        season.lastMonth().lastDay(),
      ),
    });
  });

  const tournamentInput = async (c: Parameters<Parameters<ApiApp['defineRoute']>[1]>[0]) => {
    const body = await JsonBody.from(c.req.raw);
    return {
      name: body.requiredString('name'),
      date: body.requiredString('date'),
      pointsPerPhoto: body.optionalInt('pointsPerPhoto') ?? 1,
    };
  };

  api.defineRoute(admin('POST', '/api/admin/points/tournaments'), async (c, scope) => {
    const id = await new SaveTournament(tournaments(scope)).execute(null, await tournamentInput(c));
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('PUT', '/api/admin/points/tournaments/:id'), async (c, scope) => {
    await new SaveTournament(tournaments(scope)).execute(param(c, 'id'), await tournamentInput(c));
    return c.body(null, 204);
  });

  api.defineRoute(admin('DELETE', '/api/admin/points/tournaments/:id'), async (c, scope) => {
    await new DeleteTournament(tournaments(scope)).execute(param(c, 'id'));
    return c.body(null, 204);
  });

  api.defineRoute(admin('GET', '/api/admin/points/tournaments/:id'), async (c, scope) => {
    const found = await query(scope).tournament(param(c, 'id'));
    if (found === null) throw new TournamentNotFound();
    return c.json(found);
  });

  api.defineRoute(
    admin('PUT', '/api/admin/points/tournaments/:id/students/:studentId'),
    async (c, scope) => {
      const body = await JsonBody.from(c.req.raw);
      await new MarkTournamentPhoto(tournaments(scope), movements(scope), students(scope)).execute(
        param(c, 'id'),
        param(c, 'studentId'),
        body.bool('sent'),
        by(scope),
      );
      return c.body(null, 204);
    },
  );
}
