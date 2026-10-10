import {
  DiagnosisRun,
  Finding,
  type FindingStatus,
  type Fix,
  type RuleCode,
} from '../../domain/diagnostics/mod.ts';
import type { FindingRepository, RunLog } from '../../application/diagnostics/mod.ts';
import { Row, type Sql } from './sql.ts';

const COLUMNS =
  `id, rule, severity, entity_kind, entity_id, entity_label, fingerprint, explanation, proposal,
  fix, status, detected_at, last_seen_at, closed_at, closed_by`;

function restore(row: Row): Finding {
  return Finding.restore({
    id: row.string('id'),
    rule: row.string('rule') as RuleCode,
    entity: {
      kind: row.string('entity_kind') as Finding['entity']['kind'],
      id: row.string('entity_id'),
      label: row.string('entity_label'),
    },
    fingerprint: row.string('fingerprint'),
    explanation: row.string('explanation'),
    proposal: row.string('proposal'),
    fix: row.json('fix') as Fix | null,
    status: row.string('status') as FindingStatus,
    detectedAt: row.date('detected_at'),
    lastSeenAt: row.date('last_seen_at'),
    closedAt: row.nullableDate('closed_at'),
    closedBy: row.nullableString('closed_by'),
  });
}

/** Hallazgos del diagnóstico (tabla `diagnostics_finding`). */
export class SqlFindingRepository implements FindingRepository {
  constructor(private readonly sql: Sql) {}

  open(): Promise<Finding[]> {
    return this.list('open');
  }

  async dismissedFingerprints(): Promise<Set<string>> {
    const rows = await this
      .sql`SELECT fingerprint FROM diagnostics_finding WHERE status = 'dismissed'`;
    return new Set(Row.all(rows).map((r) => r.string('fingerprint')));
  }

  async byId(id: string): Promise<Finding | null> {
    const rows = await this.sql.unsafe(`SELECT ${COLUMNS} FROM diagnostics_finding WHERE id = $1`, [
      id,
    ]);
    const row = Row.all(rows)[0];
    return row ? restore(row) : null;
  }

  async save(finding: Finding): Promise<void> {
    const fix = finding.fix === null ? null : this.sql.json(finding.fix);
    await this
      .sql`INSERT INTO diagnostics_finding (id, rule, severity, entity_kind, entity_id, entity_label,
        fingerprint, explanation, proposal, fix, status, detected_at, last_seen_at, closed_at, closed_by)
      VALUES (${finding.id}, ${finding.rule}, ${finding.severity()}, ${finding.entity.kind},
        ${finding.entity.id}, ${finding.entity.label}, ${finding.fingerprint.value},
        ${finding.explanation}, ${finding.proposal}, ${fix}, ${finding.status()},
        ${finding.detectedAt}, ${finding.lastSeenAt()}, ${finding.closedAt()}, ${finding.closedBy()})
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, last_seen_at = EXCLUDED.last_seen_at,
        closed_at = EXCLUDED.closed_at, closed_by = EXCLUDED.closed_by`;
  }

  async saveAll(findings: Finding[]): Promise<void> {
    for (const finding of findings) await this.save(finding);
  }

  /** Los de un estado, por fecha de detección (el orden de pantalla lo pone el caso de uso). */
  async list(status: FindingStatus): Promise<Finding[]> {
    const rows = await this.sql.unsafe(
      `SELECT ${COLUMNS} FROM diagnostics_finding WHERE status = $1 ORDER BY detected_at, id`,
      [status],
    );
    return Row.all(rows).map(restore);
  }
}

/** Ejecuciones del diagnóstico (tabla `diagnostics_run`). */
export class SqlRunLog implements RunLog {
  constructor(private readonly sql: Sql) {}

  async saveRun(run: DiagnosisRun): Promise<void> {
    await this.sql`INSERT INTO diagnostics_run
      (id, started_at, finished_at, launched_by, open_count, new_count, resolved_count)
      VALUES (${run.id}, ${run.startedAt}, ${run.finishedAt}, ${run.launchedBy}, ${run.openCount},
        ${run.newCount}, ${run.resolvedCount})`;
  }

  async lastRun(): Promise<DiagnosisRun | null> {
    const rows = await this
      .sql`SELECT id, started_at, finished_at, launched_by, open_count, new_count,
      resolved_count FROM diagnostics_run ORDER BY started_at DESC LIMIT 1`;
    const row = Row.all(rows)[0];
    if (!row) return null;
    return DiagnosisRun.completed({
      id: row.string('id'),
      startedAt: row.date('started_at'),
      finishedAt: row.date('finished_at'),
      launchedBy: row.string('launched_by'),
      openCount: row.int('open_count'),
      newCount: row.int('new_count'),
      resolvedCount: row.int('resolved_count'),
    });
  }
}
