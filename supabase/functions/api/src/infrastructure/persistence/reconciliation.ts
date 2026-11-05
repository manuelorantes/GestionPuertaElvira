import type {
  BankMatch,
  BankMatchRepository,
  MatchTarget,
  Payer,
  PayerNames,
} from '../../application/accounting/reconciliation.ts';
import type { ReconciledItems } from '../../application/common/mod.ts';
import { type BankMovement, movementKey } from '../../domain/accounting/reconciliation.ts';
import { Row, type Sql } from './sql.ts';

export class SqlBankMatchRepository implements BankMatchRepository {
  constructor(private readonly sql: Sql) {}

  async matches(): Promise<BankMatch[]> {
    const rows = await this
      .sql`SELECT * FROM accounting_bank_match ORDER BY operation_date, movement_key`;
    return Row.all(rows).map((r) => ({
      key: r.string('movement_key'),
      operationDate: r.string('operation_date'),
      amountCents: r.int('amount_cents'),
      concept: r.string('concept'),
      targets: targetsOf(r.json('targets')),
    }));
  }

  async saveMatch(match: BankMatch): Promise<void> {
    await this
      .sql`INSERT INTO accounting_bank_match (movement_key, operation_date, amount_cents, concept, targets)
      VALUES (${match.key}, ${match.operationDate}, ${match.amountCents}, ${match.concept},
        ${this.sql.json(match.targets.map((t) => ({ source: t.source, sourceId: t.sourceId })))})
      ON CONFLICT (movement_key) DO UPDATE SET targets = EXCLUDED.targets, concept = EXCLUDED.concept`;
  }

  async rules(): Promise<Map<string, string>> {
    const rows = await this.sql`SELECT counterparty, category FROM accounting_bank_rule`;
    return new Map(Row.all(rows).map((r) => [r.string('counterparty'), r.string('category')]));
  }

  async saveRule(counterparty: string, category: string): Promise<void> {
    const key = [...counterparty].slice(0, 120).join('');
    if (key === '') return;
    await this
      .sql`INSERT INTO accounting_bank_rule (counterparty, category) VALUES (${key}, ${category})
      ON CONFLICT (counterparty) DO UPDATE SET category = EXCLUDED.category`;
  }

  async saveMovements(movements: readonly BankMovement[]): Promise<void> {
    for (const m of movements) {
      await this.sql`INSERT INTO accounting_bank_movement
          (movement_key, operation_date, value_date, concept, amount_cents, balance_cents)
        VALUES (${movementKey(m)}, ${m.operationDate}, ${m.valueDate},
          ${[...m.concept].slice(0, 300).join('')}, ${m.amountCents}, ${m.balanceCents})
        ON CONFLICT (movement_key) DO NOTHING`;
    }
  }

  async movements(): Promise<BankMovement[]> {
    const rows = await this.sql`SELECT operation_date::text AS operation_date,
        value_date::text AS value_date, concept, amount_cents, balance_cents
      FROM accounting_bank_movement ORDER BY operation_date, movement_key`;
    return Row.all(rows).map((r) => ({
      operationDate: r.string('operation_date'),
      valueDate: r.string('value_date'),
      concept: r.string('concept'),
      amountCents: r.int('amount_cents'),
      balanceCents: r.int('balance_cents'),
    }));
  }

  async payerStudents(): Promise<Map<string, string[]>> {
    const rows = await this.sql`SELECT counterparty, student_id FROM accounting_bank_payer`;
    const map = new Map<string, string[]>();
    for (const r of Row.all(rows)) {
      const key = r.string('counterparty');
      map.set(key, [...(map.get(key) ?? []), r.string('student_id')]);
    }
    return map;
  }

  async savePayerStudents(counterparty: string, studentIds: string[]): Promise<void> {
    const key = [...counterparty].slice(0, 120).join('');
    if (key === '') return;
    for (const studentId of studentIds) {
      await this.sql`INSERT INTO accounting_bank_payer (counterparty, student_id)
        VALUES (${key}, ${studentId}) ON CONFLICT DO NOTHING`;
    }
  }
}

function targetsOf(value: unknown): MatchTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t) =>
    typeof t === 'object' && t !== null && typeof t.source === 'string' &&
      typeof t.sourceId === 'string'
      ? [{ source: t.source, sourceId: t.sourceId }]
      : []
  );
}

/** El nombre del alumno y los de sus tutores. */
export class SqlPayerNames implements PayerNames {
  constructor(private readonly sql: Sql) {}

  async names(studentIds: string[]): Promise<Map<string, string[]>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.sql`SELECT id, full_name, guardians FROM students_student
      WHERE id = ANY(${studentIds}::uuid[])`;
    return new Map(Row.all(rows).map((r) => [r.string('id'), namesOf(r)]));
  }

  /** Los alumnos activos ese día, con sus nombres. */
  async active(day: string): Promise<Payer[]> {
    const rows = await this.sql`SELECT id, full_name, guardians FROM students_student
      WHERE withdrawn_on IS NULL OR withdrawn_on > ${day}`;
    return Row.all(rows).map((r) => ({
      studentId: r.string('id'),
      name: r.string('full_name'),
      names: namesOf(r),
    }));
  }
}

function namesOf(r: Row): string[] {
  const guardians = r.json('guardians');
  const names = Array.isArray(guardians)
    ? guardians.flatMap((g) => (typeof g?.name === 'string' && g.name ? [g.name as string] : []))
    : [];
  return [r.string('full_name'), ...names];
}

/** Lo casado con un movimiento del extracto del banco. */
export class SqlReconciledItems implements ReconciledItems {
  constructor(private readonly sql: Sql) {}

  async isReconciled(source: string, sourceId: string): Promise<boolean> {
    const rows = await this.sql`SELECT 1 FROM accounting_bank_match
      WHERE targets::jsonb @> ${this.sql.json([{ source, sourceId }])}::jsonb LIMIT 1`;
    return rows.length > 0;
  }

  /** Todo lo conciliado, como «source:sourceId». */
  async keys(): Promise<Set<string>> {
    const rows = await this.sql`SELECT t->>'source' AS source, t->>'sourceId' AS source_id
      FROM accounting_bank_match, jsonb_array_elements(targets::jsonb) t`;
    return new Set(Row.all(rows).map((r) => `${r.string('source')}:${r.string('source_id')}`));
  }
}
