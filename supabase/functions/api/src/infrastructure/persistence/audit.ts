import { generateUuidV7 } from '../../domain/common/mod.ts';
import type {
  AuditActionView,
  AuditChangeView,
  AuditFilter,
  AuditLog,
  AuditReverter,
} from '../../application/audit/mod.ts';
import { AuditLabels } from '../audit/mod.ts';
import { Row, type Sql } from './sql.ts';

/** Las cuentas de usuario se registran pero no se revierten. */
const NOT_REVERTIBLE = 'identity_user';
/** Campos que nunca se muestran. */
const SECRET = /password|token|hash/i;

const ACTION_COLUMNS = `
  a.id, a.seq, a.kind, a.user_id, a.user_name, a.label, a.occurred_at, a.reverts,
  (SELECT COUNT(*) FROM audit_change c WHERE c.action_id = a.id) AS change_count,
  (SELECT COUNT(*) FROM audit_change c WHERE c.action_id = a.id AND c.table_name <> 'identity_user') AS revertible,
  (SELECT COALESCE(json_agg(DISTINCT c.table_name), '[]') FROM audit_change c WHERE c.action_id = a.id) AS tables`;

function madridIso(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'longOffset',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const offset = String(parts.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function view(row: Row): AuditActionView {
  const tables = row.stringList('tables');
  return {
    id: row.string('id'),
    seq: row.int('seq'),
    kind: row.string('kind'),
    userId: row.nullableString('user_id'),
    userName: row.string('user_name'),
    label: row.string('label'),
    occurredAt: madridIso(row.date('occurred_at')),
    changeCount: row.int('change_count'),
    affected: [...new Set(tables.map((t) => AuditLabels.table(t)))],
    reverts: row.nullableString('reverts'),
    undoable: row.int('revertible') > 0,
  };
}

/**
 * Lectura y reversión del historial (tablas audit_action y audit_change, rellenadas por el trigger audit_capture).
 */
export class SqlAuditLog implements AuditLog, AuditReverter {
  constructor(private readonly sql: Sql) {}

  async actions(filter: AuditFilter): Promise<AuditActionView[]> {
    const limit = Math.max(1, Math.min(200, filter.limit ?? 50));
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS} FROM audit_action a
        WHERE ($1::uuid IS NULL OR a.user_id = $1::uuid) AND ($2::bigint IS NULL OR a.seq < $2::bigint)
        ORDER BY a.seq DESC LIMIT $3`,
      [filter.userId ?? null, filter.beforeSeq ?? null, limit],
    );
    return Row.all(rows).map(view);
  }

  async action(id: string): Promise<AuditActionView | null> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS} FROM audit_action a WHERE a.id = $1::uuid`,
      [id],
    );
    return rows[0] ? view(new Row(rows[0])) : null;
  }

  async changes(actionId: string): Promise<AuditChangeView[]> {
    const rows = await this
      .sql`SELECT table_name, row_key, operation, before, after FROM audit_change
      WHERE action_id = ${actionId}::uuid ORDER BY id`;
    return Row.all(rows).map((row) => {
      const before = (row.json('before') ?? {}) as Record<string, unknown>;
      const after = (row.json('after') ?? {}) as Record<string, unknown>;
      const operation = row.string('operation');
      const fields: AuditChangeView['fields'] = [];
      for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (SECRET.test(field)) continue;
        const old = before[field] ?? null;
        const fresh = after[field] ?? null;
        if (operation !== 'U' || JSON.stringify(old) !== JSON.stringify(fresh)) {
          fields.push({ field, before: old, after: fresh });
        }
      }
      return {
        table: row.string('table_name'),
        tableLabel: AuditLabels.table(row.string('table_name')),
        key: (row.json('row_key') ?? {}) as Record<string, unknown>,
        operation,
        fields,
      };
    });
  }

  async people(): Promise<{ id: string; name: string }[]> {
    const rows = await this.sql`SELECT DISTINCT ON (user_id) user_id, user_name FROM audit_action
      WHERE user_id IS NOT NULL ORDER BY user_id, seq DESC`;
    return Row.all(rows).map((r) => ({ id: r.string('user_id'), name: r.string('user_name') }));
  }

  async begin(label: string, kind: string, reverts: string): Promise<void> {
    const id = generateUuidV7();
    await this.sql`INSERT INTO audit_action (id, kind, user_id, user_name, label, reverts)
      VALUES (${id}, ${kind}, NULLIF(current_setting('audit.user_id', true), '')::uuid,
              COALESCE(NULLIF(current_setting('audit.user_name', true), ''), 'Sistema'), ${
      [...label].slice(0, 160).join('')
    }, ${reverts})`;
    await this.sql`SELECT set_config('audit.action_id', ${id}, true)`;
  }

  async changesOf(actionId: string): Promise<number[]> {
    const rows = await this
      .sql`SELECT id FROM audit_change WHERE action_id = ${actionId}::uuid AND table_name <> ${NOT_REVERTIBLE} ORDER BY id DESC`;
    return Row.all(rows).map((r) => r.int('id'));
  }

  async changesAfter(actionId: string): Promise<number[]> {
    const rows = await this.sql`SELECT c.id FROM audit_change c
      WHERE c.table_name <> ${NOT_REVERTIBLE}
        AND c.action_id IN (SELECT later.id FROM audit_action later WHERE later.seq > (SELECT seq FROM audit_action WHERE id = ${actionId}::uuid))
      ORDER BY c.id DESC`;
    return Row.all(rows).map((r) => r.int('id'));
  }

  async laterActionsTouchingTheSameRecords(actionId: string): Promise<AuditActionView[]> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS} FROM audit_action a
        WHERE a.seq > (SELECT seq FROM audit_action WHERE id = $1::uuid)
          AND EXISTS (
            SELECT 1 FROM audit_change later JOIN audit_change mine
              ON mine.table_name = later.table_name AND mine.row_key = later.row_key
             WHERE later.action_id = a.id AND mine.action_id = $1::uuid AND later.table_name <> $2
          )
        ORDER BY a.seq`,
      [actionId, NOT_REVERTIBLE],
    );
    return Row.all(rows).map(view);
  }

  async revert(changeId: number): Promise<void> {
    await this.sql`SELECT audit_revert_change(${changeId})`;
  }
}
