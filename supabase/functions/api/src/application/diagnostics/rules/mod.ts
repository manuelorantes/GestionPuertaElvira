// Todas las reglas del diagnóstico, en el orden del catálogo del dominio.
import { RULE_CATALOGUE, type RuleCode } from '../../../domain/diagnostics/mod.ts';
import type { Candidate, Facts, Rule } from '../facts.ts';
import { accountingRules } from './accounting.ts';
import { familyRules } from './family.ts';
import { feeRules } from './fees.ts';
import { integrityRules } from './integrity.ts';
import { payrollRules } from './payroll.ts';
import { studentRules } from './students.ts';

const ALL: readonly Rule[] = [
  ...feeRules,
  ...familyRules,
  ...studentRules,
  ...accountingRules,
  ...payrollRules,
  ...integrityRules,
];

/** Qué regla produce cada código, averiguado ejecutándolas sobre hechos vacíos no sirve: se declara aquí. */
const BY_CODE: Record<RuleCode, Rule> = {
  fee_mismatch: feeRules[0] as Rule,
  charge_without_group: feeRules[1] as Rule,
  paid_but_no_group: feeRules[2] as Rule,
  member_never_paid: feeRules[3] as Rule,
  enrolment_after_payment: feeRules[4] as Rule,
  family_unlinked: familyRules[0] as Rule,
  family_not_mutual: familyRules[1] as Rule,
  adult_guardian_is_self: studentRules[0] as Rule,
  name_format: studentRules[1] as Rule,
  member_number_duplicate: studentRules[2] as Rule,
  generic_category: accountingRules[0] as Rule,
  invoice_duplicates_entry: accountingRules[1] as Rule,
  teacher_expense_as_entry: accountingRules[2] as Rule,
  income_without_hours: payrollRules[0] as Rule,
  settlement_sessions_mismatch: payrollRules[1] as Rule,
  ledger_payments_mismatch: integrityRules[0] as Rule,
  covered_payments_mismatch: integrityRules[1] as Rule,
  receipt_gaps: integrityRules[2] as Rule,
  receipt_order: integrityRules[3] as Rule,
  charge_cover_inconsistent: integrityRules[4] as Rule,
  points_mismatch: integrityRules[5] as Rule,
};

/** Las reglas, en el orden de pantalla del catálogo. */
export const RULES: readonly Rule[] = RULE_CATALOGUE.map((definition) => BY_CODE[definition.code]);

export function ruleFor(code: RuleCode): Rule {
  return BY_CODE[code];
}

/** Ejecuta todas las reglas sobre unos hechos. */
export function evaluateAll(facts: Facts): Candidate[] {
  return RULES.flatMap((rule) => rule(facts));
}

export { ALL as RULE_MODULES };
