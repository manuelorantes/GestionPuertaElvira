import type {
  BankMatch,
  BankMatchRepository,
  MatchTarget,
  PayerNames,
} from '../../application/accounting/reconciliation.ts';
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
        ${this.sql.json(match.targets.map((t) => ({ source: t.source, sourceId: t.sourceId })))})`;
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
    return new Map(
      Row.all(rows).map((r) => {
        const guardians = r.json('guardians');
        const names = Array.isArray(guardians)
          ? guardians.flatMap((
            g,
          ) => (typeof g?.name === 'string' && g.name ? [g.name as string] : []))
          : [];
        return [r.string('id'), [r.string('full_name'), ...names]];
      }),
    );
  }
}
