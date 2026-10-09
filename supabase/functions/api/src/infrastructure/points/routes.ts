import { InvalidValue, LocalDate, Season, YearMonth } from '../../domain/common/mod.ts';
import type { PointsKind } from '../../domain/points/mod.ts';
import {
  AddTournamentPhoto,
  AdjustPointsByHand,
  DeleteTournamentPhoto,
  fridaysOf,
  MarkFriday,
  PhotoNotFound,
  type PhotoStorage,
} from '../../application/points/mod.ts';
import { sniffMimeType } from '../accounting/routes.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { JsonBody } from '../http/json-body.ts';
import {
  SqlPointMovementRepository,
  SqlPointsQuery,
  SqlPointsStudents,
  SqlTournamentPhotoRepository,
} from '../persistence/points.ts';

const KINDS: readonly PointsKind[] = ['friday', 'tournament', 'manual', 'redemption'];

/** Sección Puntos (administración): /api/admin/points/* */
export function registerPointsRoutes(api: ApiApp, storage: PhotoStorage): void {
  registerDomainErrors({
    PointsAlreadySpent: [409, 'points_already_spent'],
    PointsStudentNotFound: [404, 'not_found'],
    PhotoNotFound: [404, 'not_found'],
  });
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, upload = false) =>
    ({ method, path, access: 'admin', upload }) as const;
  const { clock } = api.deps;
  const today = () => LocalDate.fromInstant(clock.now());
  const movements = (scope: RequestScope) => new SqlPointMovementRepository(scope.tx);
  const students = (scope: RequestScope) => new SqlPointsStudents(scope.tx);
  const photos = (scope: RequestScope) => new SqlTournamentPhotoRepository(scope.tx);
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

  // ---- Fotos de torneo ---------------------------------------------------------------------------
  api.defineRoute(admin('GET', '/api/admin/points/photos'), async (c, scope) => {
    const month = monthOf(c.req.query('month'));
    return c.json({
      month: month.toString(),
      items: await query(scope).photos(month.firstDay(), month.lastDay()),
    });
  });

  api.defineRoute(admin('POST', '/api/admin/points/photos', true), async (c, scope) => {
    const form = await c.req.raw.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new InvalidValue('file', 'Adjunta la foto.');
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };
    const contents = new Uint8Array(await file.arrayBuffer());
    const id = await new AddTournamentPhoto(
      photos(scope),
      movements(scope),
      students(scope),
      storage,
      clock,
    )
      .execute(
        text('studentId'),
        text('date') || today().toString(),
        text('note') || null,
        { contents, mimeType: sniffMimeType(contents) },
        by(scope),
      );
    return c.json({ id }, 201);
  });

  api.defineRoute(admin('GET', '/api/admin/points/photos/:id/file'), async (c, scope) => {
    const photo = await photos(scope).find(param(c, 'id'));
    if (photo === null) throw new PhotoNotFound();
    const contents = await storage.read(photo.documentKey);
    return c.body(contents as unknown as ArrayBuffer, 200, {
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  api.defineRoute(admin('DELETE', '/api/admin/points/photos/:id'), async (c, scope) => {
    await new DeleteTournamentPhoto(photos(scope), movements(scope), storage).execute(
      param(c, 'id'),
    );
    return c.body(null, 204);
  });
}
