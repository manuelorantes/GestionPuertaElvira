import { InvalidValue } from '../../domain/common/mod.ts';
import type { FindingStatus } from '../../domain/diagnostics/mod.ts';
import {
  AcceptFinding,
  DismissFinding,
  ListFindings,
  RunDiagnosis,
} from '../../application/diagnostics/mod.ts';
import { type ApiApp, param, type RequestScope } from '../http/app.ts';
import { registerDomainErrors } from '../http/errors.ts';
import { SqlFindingRepository, SqlRunLog } from '../persistence/diagnostics.ts';
import { PostgresAdvisoryLocks } from '../persistence/sql.ts';
import { SqlDiagnosticsFacts } from './facts.ts';
import { UseCaseFixExecutor } from './fixes.ts';

const STATUSES: FindingStatus[] = ['open', 'accepted', 'dismissed', 'resolved'];

function statusFrom(value: string | undefined): FindingStatus {
  const status = value ?? 'open';
  if (!STATUSES.includes(status as FindingStatus)) {
    throw new InvalidValue('status', 'Estado de hallazgo desconocido.');
  }
  return status as FindingStatus;
}

/** Quién pulsa: el nombre de la cuenta (el historial ya guarda la suplantación aparte). */
const actor = (scope: RequestScope): string => scope.user?.fullName ?? 'Sistema';

/** Rutas del diagnóstico de datos (pestaña «Diagnóstico» de Contabilidad): /api/admin/diagnostics. */
export function registerDiagnosticsRoutes(api: ApiApp): void {
  registerDomainErrors({
    FindingNotFound: [404, 'not_found'],
    FindingOutdated: [409, 'finding_outdated'],
    FindingNotOpen: [409, 'finding_closed'],
    FindingHasNoFix: [409, 'finding_has_no_fix'],
  });
  const admin = (method: 'GET' | 'POST', path: string) => ({
    method,
    path,
    access: 'admin' as const,
  });
  const repos = (scope: RequestScope) => ({
    findings: new SqlFindingRepository(scope.tx),
    runs: new SqlRunLog(scope.tx),
    facts: new SqlDiagnosticsFacts(scope.tx, api.deps.clock),
  });

  api.defineRoute(admin('GET', '/api/admin/diagnostics'), async (c, scope) => {
    const { findings, runs } = repos(scope);
    return c.json(
      await new ListFindings(findings, runs).execute(statusFrom(c.req.query('status'))),
    );
  });

  api.defineRoute(admin('POST', '/api/admin/diagnostics/run'), async (c, scope) => {
    const { findings, runs, facts } = repos(scope);
    const run = await new RunDiagnosis(
      facts,
      findings,
      runs,
      api.deps.clock,
      new PostgresAdvisoryLocks(scope.tx),
    ).execute(actor(scope));
    return c.json({
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt.toISOString(),
      launchedBy: run.launchedBy,
      openCount: run.openCount,
      newCount: run.newCount,
      resolvedCount: run.resolvedCount,
    });
  });

  api.defineRoute(admin('POST', '/api/admin/diagnostics/findings/:id/accept'), async (c, scope) => {
    const { findings, facts } = repos(scope);
    await new AcceptFinding(findings, facts, new UseCaseFixExecutor(api, scope), api.deps.clock)
      .execute(param(c, 'id'), actor(scope));
    return c.body(null, 204);
  });

  api.defineRoute(
    admin('POST', '/api/admin/diagnostics/findings/:id/dismiss'),
    async (c, scope) => {
      const { findings } = repos(scope);
      await new DismissFinding(findings, api.deps.clock).execute(param(c, 'id'), actor(scope));
      return c.body(null, 204);
    },
  );
}
