import { generateUuidV7 } from '../../domain/common/mod.ts';
import { LocalDate } from '../../domain/common/mod.ts';
import type {
  AuditActionView,
  AuditChangeView,
  AuditClassView,
  AuditDetail,
  AuditFilter,
  AuditLog,
  AuditPaymentsPage,
  AuditPaymentView,
  AuditReference,
  AuditReferenceKind,
  AuditReverter,
  AuditTarget,
} from '../../application/audit/mod.ts';
import {
  type AuditRow,
  isHiddenField,
  monthLabel,
  referencesOf,
  referenceTarget,
  titleOf,
} from '../audit/describe.ts';
import { AuditLabels } from '../audit/mod.ts';
import { SqlClassCommentQuery } from './rollcalls.ts';
import { Row, type Sql } from './sql.ts';

/** Orden alfabético de las acciones, como se leen en español. */
const LABEL_ORDER = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

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
/**
 * El historial muestra solo lo que cambió datos guardados: los eventos de sesión (inicios, cierres, intentos
 * fallidos, suplantaciones) siguen registrándose por seguridad y para la última conexión, pero no se listan.
 */
const PERSISTED =
  `a.kind <> 'security' AND EXISTS (SELECT 1 FROM audit_change c WHERE c.action_id = a.id)`;

/** Persona ($1), tablas de la sección ($2), desde cuándo ($3) y acciones ($4): ver `filterParams`. */
const FILTERED = `($1::uuid IS NULL OR a.user_id = $1::uuid)
  AND ($2::text[] IS NULL OR EXISTS (SELECT 1 FROM audit_change t WHERE t.action_id = a.id AND t.table_name = ANY($2::text[])))
  AND ($3::timestamptz IS NULL OR a.occurred_at >= $3::timestamptz)
  AND ($4::text[] IS NULL OR a.label = ANY($4::text[]))`;
/** Página: anterior a ($5) y cuántas ($6), tras los parámetros de `FILTERED`. */
const PAGED = `($5::bigint IS NULL OR a.seq < $5::bigint) ORDER BY a.seq DESC`;

function filterParams(filter: AuditFilter): (string | string[] | Date | null)[] {
  return [
    filter.userId ?? null,
    filter.tables ? [...filter.tables] : null,
    filter.since ?? null,
    filter.labels?.length ? [...filter.labels] : null,
  ];
}

function pageParams(filter: AuditFilter): (string | number | string[] | Date | null)[] {
  return [
    ...filterParams(filter),
    filter.beforeSeq ?? null,
    Math.max(1, Math.min(200, filter.limit ?? 50)),
  ];
}

/** A qué clase (grupo o turno, y día) apunta cada cambio de asistencia de una acción ($2: sus tablas). */
const CLASS_KEYS = `SELECT DISTINCT
    COALESCE(c.after, c.before)->>'group_id' AS group_id,
    COALESCE(c.after, c.before)->>'duty_id' AS duty_id,
    COALESCE(COALESCE(c.after, c.before)->>'roll_date', COALESCE(c.after, c.before)->>'class_date',
             COALESCE(c.after, c.before)->>'check_date') AS day
  FROM audit_change c WHERE c.action_id = a.id AND c.table_name = ANY($2::text[])`;

/** Un cobro que una acción registró (alta) o quitó (baja, al deshacer o volver atrás). */
const PAYMENT_CHANGE =
  `c.action_id = a.id AND c.table_name = 'billing_payment' AND c.operation IN ('I', 'D')`;
const SIGNED_CENTS =
  `CASE WHEN c.operation = 'I' THEN (c.after->>'total_cents')::int ELSE -(c.before->>'total_cents')::int END`;
const PAYMENT_COLUMNS = `
  c.row_key->>'id' AS payment_id,
  COALESCE(c.after, c.before)->>'receipt_number' AS receipt_number,
  COALESCE(c.after, c.before)->>'student_id' AS student_id,
  COALESCE(c.after, c.before)->>'concept' AS concept,
  COALESCE(c.after, c.before)->>'method' AS method,
  ${SIGNED_CENTS} AS signed_cents`;

export class SqlAuditLog implements AuditLog, AuditReverter {
  constructor(private readonly sql: Sql) {}

  async actions(filter: AuditFilter): Promise<AuditActionView[]> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS} FROM audit_action a
        WHERE ${PERSISTED} AND ${FILTERED} AND ${PAGED} LIMIT $6`,
      pageParams(filter),
    );
    return Row.all(rows).map(view);
  }

  async payments(filter: AuditFilter): Promise<AuditPaymentsPage> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS}, ${PAYMENT_COLUMNS} FROM audit_action a JOIN audit_change c ON ${PAYMENT_CHANGE}
        WHERE ${PERSISTED} AND ${FILTERED} AND ${PAGED}, c.id LIMIT $6`,
      pageParams(filter),
    );
    const totals = await this.sql.unsafe(
      `SELECT COALESCE(SUM(${SIGNED_CENTS}), 0)::int AS total_cents
         FROM audit_action a JOIN audit_change c ON ${PAYMENT_CHANGE}
        WHERE ${PERSISTED} AND ${FILTERED}`,
      filterParams(filter),
    );
    const names = new AuditNames(this.sql);
    const payments = Row.all(rows);
    for (const row of payments) names.want('student', row.string('student_id'));
    await names.resolve();
    const items = payments.map((row): AuditPaymentView => {
      const studentId = row.string('student_id');
      return {
        ...view(row),
        paymentId: row.string('payment_id'),
        receiptNumber: row.string('receipt_number'),
        studentId,
        studentName: names.label('student', studentId) ?? '',
        concept: row.string('concept'),
        method: row.string('method'),
        totalCents: row.int('signed_cents'),
      };
    });
    return { items, totalCents: Row.all(totals)[0]?.int('total_cents') ?? 0 };
  }

  async action(id: string): Promise<AuditActionView | null> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS} FROM audit_action a WHERE a.id = $1::uuid`,
      [id],
    );
    return rows[0] ? view(new Row(rows[0])) : null;
  }

  async changes(actionId: string): Promise<AuditDetail> {
    const rows = await this
      .sql`SELECT table_name, row_key, operation, before, after FROM audit_change
      WHERE action_id = ${actionId}::uuid ORDER BY id`;
    const raw = Row.all(rows).map((row) => ({
      table: row.string('table_name'),
      key: (row.json('row_key') ?? {}) as AuditRow,
      operation: row.string('operation'),
      before: row.json('before') as AuditRow | null,
      after: row.json('after') as AuditRow | null,
    }));
    const names = new AuditNames(this.sql);
    // Lo que mencionan los cambios (y lo que necesitan sus títulos) se resuelve de una vez.
    for (const change of raw) {
      for (const snapshot of [change.before, change.after]) {
        for (const ref of referencesOf(snapshot ?? {})) names.want(ref.kind, ref.id);
      }
    }
    await names.resolve();
    const name = (kind: AuditReferenceKind, id: string) => names.label(kind, id);
    const changes = raw.map(({ table, key, operation, before, after }): AuditChangeView => {
      const fields: AuditChangeView['fields'] = [];
      for (const field of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
        if (SECRET.test(field) || isHiddenField(field)) continue;
        const old = before?.[field] ?? null;
        const fresh = after?.[field] ?? null;
        if (operation !== 'U' || JSON.stringify(old) !== JSON.stringify(fresh)) {
          fields.push({ field, before: old, after: fresh });
        }
      }
      return {
        table,
        tableLabel: AuditLabels.table(table),
        title: titleOf(table, after ?? before ?? {}, name),
        key,
        operation,
        fields,
        target: auditTarget(table, operation, before, after),
      };
    });
    return { changes, references: names.references() };
  }

  async classes(filter: AuditFilter): Promise<AuditClassView[]> {
    const rows = await this.sql.unsafe(
      `SELECT ${ACTION_COLUMNS}, k.group_id, k.duty_id, k.day, g.name AS group_name, d.label AS duty_label
         FROM audit_action a
         JOIN LATERAL (${CLASS_KEYS}) k ON k.day IS NOT NULL
         LEFT JOIN classes_group g ON g.id::text = k.group_id
         LEFT JOIN payroll_duty d ON d.id::text = k.duty_id
        WHERE ${PERSISTED} AND ($1::uuid IS NULL OR a.user_id = $1::uuid)
          AND ($3::date IS NULL OR k.day::date >= $3::date)
        ORDER BY k.day DESC, a.seq DESC`,
      [
        filter.userId ?? null,
        filter.tables ? [...filter.tables] : null,
        filter.sinceDay?.toString() ?? null,
      ],
    );
    const names = new AuditNames(this.sql);
    const all = Row.all(rows);
    for (const row of all) {
      const groupId = row.nullableString('group_id');
      if (groupId !== null && row.nullableString('group_name') === null) {
        names.want('group', groupId);
      }
    }
    await names.resolve();
    const classes = new Map<string, AuditClassView>();
    for (const row of all) {
      const groupId = row.nullableString('group_id');
      const day = row.string('day');
      const key = `${groupId ?? row.nullableString('duty_id') ?? ''}|${day}`;
      const existing = classes.get(key);
      if (existing) {
        existing.actions.push(view(row));
        continue;
      }
      const label = row.nullableString('group_name') ??
        (groupId === null ? null : names.label('group', groupId)) ??
        row.nullableString('duty_label') ?? 'Clase borrada';
      classes.set(key, { groupId, label, date: day, actions: [view(row)], notes: [] });
    }
    const comments = new SqlClassCommentQuery(this.sql);
    for (const klass of classes.values()) {
      if (klass.groupId === null) continue;
      klass.notes = (await comments.ofClass(klass.groupId, LocalDate.fromString(klass.date))).map(
        (c) => ({ id: c.id, studentName: c.studentName, text: c.text, author: c.author }),
      );
    }
    return [...classes.values()];
  }

  async people(): Promise<{ id: string; name: string }[]> {
    const rows = await this.sql.unsafe(
      `SELECT DISTINCT ON (a.user_id) a.user_id, a.user_name FROM audit_action a
        WHERE a.user_id IS NOT NULL AND ${PERSISTED} ORDER BY a.user_id, a.seq DESC`,
    );
    return Row.all(rows).map((r) => ({ id: r.string('user_id'), name: r.string('user_name') }));
  }

  async labels(filter: AuditFilter): Promise<{ label: string; count: number }[]> {
    const rows = await this.sql.unsafe(
      `SELECT a.label, COUNT(*)::int AS count FROM audit_action a
        WHERE ${PERSISTED} AND ${FILTERED} GROUP BY a.label`,
      filterParams({ ...filter, labels: null }),
    );
    return Row.all(rows)
      .map((r) => ({ label: r.string('label'), count: r.int('count') }))
      .sort((a, b) => LABEL_ORDER.compare(a.label, b.label));
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

/**
 * Dónde se ve en la aplicación la fila que tocó un cambio. Si se borró el propio elemento no hay dónde ir;
 * si se borró algo que cuelga de otro (una inscripción, una sesión), se va a ese otro.
 */
export function auditTarget(
  table: string,
  operation: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditTarget | null {
  const row = after ?? before ?? {};
  const text = (field: string) => (typeof row[field] === 'string' ? (row[field] as string) : null);
  const deleted = operation === 'D';
  const own = (kind: 'payment' | 'student' | 'group' | 'teacher'): AuditTarget | null => {
    const id = text('id');
    return deleted || id === null ? null : { kind, id };
  };
  const month = (field: string) => text(field)?.slice(0, 7) ?? null;
  switch (table) {
    case 'billing_payment':
      return own('payment');
    case 'students_student':
      return own('student');
    case 'classes_group':
      return own('group');
    case 'teachers_teacher':
      return own('teacher');
    case 'billing_account':
    case 'equipment_order':
    case 'classes_enrolment': {
      const id = text('student_id');
      return id === null ? null : { kind: 'student', id };
    }
    case 'billing_charge': {
      const m = month('period');
      return m === null ? null : { kind: 'charges', month: m };
    }
    case 'accounting_entry': {
      const m = month('entry_date');
      return m === null || deleted ? null : { kind: 'ledger', month: m };
    }
    case 'accounting_invoice':
      return deleted ? null : { kind: 'invoices' };
    case 'payroll_session': {
      const m = month('session_date');
      const teacherId = text('teacher_id');
      return m === null || teacherId === null ? null : { kind: 'hours', month: m, teacherId };
    }
    case 'payroll_settlement': {
      const m = month('month');
      return m === null ? null : { kind: 'settlement', month: m };
    }
    case 'billing_settings':
      return { kind: 'billing-settings' };
    default:
      return null;
  }
}

/** Una tabla con nombre: de dónde sale la etiqueta de cada clase de registro referenciado. */
const NAMED: Record<AuditReferenceKind, { table: string; sql: string }> = {
  student: {
    table: 'students_student',
    sql: `SELECT id::text AS id, full_name AS label, '{}'::json AS row FROM students_student`,
  },
  teacher: {
    table: 'teachers_teacher',
    sql: `SELECT id::text AS id, full_name AS label, '{}'::json AS row FROM teachers_teacher`,
  },
  group: {
    table: 'classes_group',
    sql: `SELECT id::text AS id, name AS label, '{}'::json AS row FROM classes_group`,
  },
  user: {
    table: 'identity_user',
    sql: `SELECT id::text AS id, full_name AS label, '{}'::json AS row FROM identity_user`,
  },
  payment: {
    table: 'billing_payment',
    sql:
      `SELECT p.id::text AS id, p.receipt_number || ' · ' || s.full_name AS label, '{}'::json AS row
            FROM billing_payment p JOIN students_student s ON s.id = p.student_id`,
  },
  charge: {
    table: 'billing_charge',
    sql:
      `SELECT c.id::text AS id, s.full_name AS label, json_build_object('period', c.period, 'kind', c.kind) AS row
            FROM billing_charge c JOIN students_student s ON s.id = c.student_id`,
  },
  product: {
    table: 'equipment_product',
    sql: `SELECT id::text AS id, name AS label, '{}'::json AS row FROM equipment_product`,
  },
  order: {
    table: 'equipment_order',
    sql:
      `SELECT o.id::text AS id, p.name || ' · ' || s.full_name AS label, json_build_object('student_id', o.student_id) AS row
            FROM equipment_order o JOIN equipment_product p ON p.id = o.product_id JOIN students_student s ON s.id = o.student_id`,
  },
  duty: {
    table: 'payroll_duty',
    sql: `SELECT id::text AS id, label, '{}'::json AS row FROM payroll_duty`,
  },
};

/**
 * Nombres de los registros que menciona un detalle del historial. Primero por su tabla; lo que ya no existe,
 * por su última foto en el propio historial (así un alumno borrado sigue teniendo nombre).
 */
class AuditNames {
  private readonly wanted = new Map<AuditReferenceKind, Set<string>>();
  private readonly found = new Map<string, AuditReference>();

  constructor(private readonly sql: Sql) {}

  want(kind: AuditReferenceKind, id: string): void {
    if (!this.wanted.has(kind)) this.wanted.set(kind, new Set());
    this.wanted.get(kind)?.add(id);
  }

  async resolve(): Promise<void> {
    for (const [kind, ids] of this.wanted) {
      const source = NAMED[kind];
      const rows = await this.sql.unsafe(
        `SELECT * FROM (${source.sql}) named WHERE named.id = ANY($1::text[])`,
        [[...ids]],
      );
      for (const r of Row.all(rows)) {
        this.add(kind, r.string('id'), r.string('label'), (r.json('row') ?? {}) as AuditRow);
      }
      const missing = [...ids].filter((id) => !this.found.has(id));
      if (missing.length === 0) continue;
      const snapshots = await this.sql.unsafe(
        `SELECT DISTINCT ON (row_key->>'id') row_key->>'id' AS id, COALESCE(after, before) AS row
           FROM audit_change WHERE table_name = $1 AND row_key->>'id' = ANY($2::text[])
          ORDER BY row_key->>'id', id DESC`,
        [source.table, missing],
      );
      for (const r of Row.all(snapshots)) {
        const row = (r.json('row') ?? {}) as AuditRow;
        const label = titleOf(source.table, row, (k, id) => this.label(k, id));
        if (label !== null) this.add(kind, r.string('id'), label, row);
      }
    }
  }

  private add(kind: AuditReferenceKind, id: string, label: string, row: AuditRow): void {
    const full = kind === 'charge'
      ? `Cuota de ${
        monthLabel(typeof row.period === 'string' ? row.period : null) ?? '?'
      } · ${label}`
      : label;
    this.found.set(id, { kind, label: full, target: referenceTarget(kind, id, row) });
  }

  label(kind: AuditReferenceKind, id: string): string | null {
    const ref = this.found.get(id);
    return ref !== undefined && ref.kind === kind ? ref.label : null;
  }

  references(): Record<string, AuditReference> {
    return Object.fromEntries(this.found);
  }
}
