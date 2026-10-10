// Diagnóstico de datos: reglas que comprueban lo que no cuadra entre contextos y los hallazgos que producen.
// Ver specs/features/diagnostico/spec.md y specs/decisions/diagnostico-con-reglas-sobre-hechos.md.

/** Gravedad de una regla: dinero, datos del club o forma. Es también el orden de la pantalla. */
export type Severity = 'money' | 'club' | 'form';

export type RuleCode =
  | 'fee_mismatch'
  | 'chained_discounts'
  | 'generic_category'
  | 'invoice_duplicates_entry'
  | 'teacher_expense_as_entry'
  | 'ledger_payments_mismatch'
  | 'covered_payments_mismatch'
  | 'charge_cover_inconsistent'
  | 'settlement_sessions_mismatch'
  | 'charge_without_group'
  | 'paid_but_no_group'
  | 'member_never_paid'
  | 'enrolment_after_payment'
  | 'family_unlinked'
  | 'family_not_mutual'
  | 'member_number_duplicate'
  | 'income_without_hours'
  | 'points_mismatch'
  | 'adult_guardian_is_self'
  | 'name_format'
  | 'receipt_gaps'
  | 'receipt_order';

export interface RuleDefinition {
  code: RuleCode;
  title: string;
  severity: Severity;
  /** Si sus hallazgos proponen un arreglo que se aplica al aceptarlos. */
  hasFix: boolean;
}

/** Las reglas, en el orden en que se muestran: primero el dinero, luego los datos del club y al final la forma. */
export const RULE_CATALOGUE: readonly RuleDefinition[] = [
  { code: 'fee_mismatch', title: 'Cuota distinta de la tarifa', severity: 'money', hasFix: true },
  {
    code: 'chained_discounts',
    title: 'Descuentos aplicados en cadena',
    severity: 'money',
    hasFix: true,
  },
  {
    code: 'generic_category',
    title: 'Gasto en una categoría genérica que tiene la suya',
    severity: 'money',
    hasFix: true,
  },
  {
    code: 'invoice_duplicates_entry',
    title: 'Factura que puede duplicar un apunte manual',
    severity: 'money',
    hasFix: false,
  },
  {
    code: 'teacher_expense_as_entry',
    title: 'Gasto de «Profesores» que nombra a un profesor',
    severity: 'money',
    hasFix: true,
  },
  {
    code: 'ledger_payments_mismatch',
    title: 'Los cobros del mes no cuadran con el libro',
    severity: 'money',
    hasFix: false,
  },
  {
    code: 'covered_payments_mismatch',
    title: 'Lo cubierto no cuadra con lo cobrado',
    severity: 'money',
    hasFix: false,
  },
  {
    code: 'charge_cover_inconsistent',
    title: 'Cuota con lo cubierto incoherente con su estado',
    severity: 'money',
    hasFix: false,
  },
  {
    code: 'settlement_sessions_mismatch',
    title: 'Horas y liquidación no cuadran',
    severity: 'money',
    hasFix: false,
  },
  {
    code: 'charge_without_group',
    title: 'Paga cuota sin estar en ningún grupo',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'paid_but_no_group',
    title: 'Pagó algún mes y ya no tiene grupo',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'member_never_paid',
    title: 'Socio sin clases que nunca ha pagado',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'enrolment_after_payment',
    title: '«En el grupo desde» después de haber pagado',
    severity: 'club',
    hasFix: true,
  },
  {
    code: 'family_unlinked',
    title: 'Posible familia sin vincular',
    severity: 'club',
    hasFix: true,
  },
  { code: 'family_not_mutual', title: 'Familia directa no mutua', severity: 'club', hasFix: true },
  {
    code: 'member_number_duplicate',
    title: 'Número de socio repetido',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'income_without_hours',
    title: 'Ingresos atribuidos sin horas',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'points_mismatch',
    title: 'Puntos del mes que no cuadran',
    severity: 'club',
    hasFix: false,
  },
  {
    code: 'adult_guardian_is_self',
    title: 'Adulto con su propio teléfono como tutor',
    severity: 'form',
    hasFix: true,
  },
  { code: 'name_format', title: 'Nombre mal escrito', severity: 'form', hasFix: true },
  {
    code: 'receipt_gaps',
    title: 'Recibos con huecos o repetidos',
    severity: 'form',
    hasFix: false,
  },
  {
    code: 'receipt_order',
    title: 'Recibos fechados antes que el anterior',
    severity: 'form',
    hasFix: false,
  },
];

export function ruleDefinition(code: RuleCode): RuleDefinition {
  const definition = RULE_CATALOGUE.find((r) => r.code === code);
  if (!definition) throw new Error(`Regla desconocida: ${code}`);
  return definition;
}

/** A qué se refiere un hallazgo. Alumnos, apuntes, facturas y profesores tienen ficha a la que enlazar. */
export type EntityKind = 'student' | 'entry' | 'invoice' | 'teacher' | 'receipt' | 'club';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  /** Nombre para mostrar; no forma parte de la huella. */
  label: string;
}

/** Datos del caso que identifican el hallazgo (lo decide cada regla). */
export type FindingData = Record<string, string | number | boolean | null>;

/**
 * Huella de un hallazgo: regla, entidad y datos del caso en texto canónico (claves ordenadas). Dos diagnósticos sin
 * cambios producen la misma huella; si cambia un dato del caso, es otro hallazgo.
 */
export class Fingerprint {
  private constructor(readonly value: string) {}

  static of(rule: RuleCode, entity: EntityRef, data: FindingData): Fingerprint {
    return new Fingerprint(`${rule}|${entity.kind}|${entity.id}|${canonicalJson(data)}`);
  }

  static fromString(value: string): Fingerprint {
    return new Fingerprint(value);
  }

  equals(other: Fingerprint): boolean {
    return this.value === other.value;
  }
}

function canonicalJson(data: FindingData): string {
  const ordered: FindingData = {};
  for (const key of Object.keys(data).sort()) ordered[key] = data[key] ?? null;
  return JSON.stringify(ordered);
}

/** Arreglo automático que propone un hallazgo; lo aplica infraestructura con los casos de uso de cada contexto. */
export type Fix =
  | { kind: 'reprice_charge'; studentId: string; month: string }
  | { kind: 'note_discount'; studentId: string; month: string; percent: number }
  | { kind: 'unchain_discounts'; studentId: string; months: string[]; percent: number }
  | { kind: 'link_family'; a: string; b: string }
  | { kind: 'set_enrolment_start'; studentId: string; groupIds: string[]; date: string }
  | { kind: 'own_phone_from_guardian'; studentId: string }
  | { kind: 'rename_student'; studentId: string; fullName: string }
  | { kind: 'set_category'; source: 'manual' | 'invoice'; id: string; category: string }
  | { kind: 'entry_to_advance'; entryId: string; teacherId: string };

export type FindingStatus = 'open' | 'accepted' | 'dismissed' | 'resolved';

export class FindingNotOpen extends Error {
  constructor() {
    super('El hallazgo ya está cerrado.');
    this.name = 'FindingNotOpen';
  }
}

export class FindingHasNoFix extends Error {
  constructor() {
    super('Este hallazgo no tiene arreglo automático: solo se puede descartar.');
    this.name = 'FindingHasNoFix';
  }
}

export interface DetectedFinding {
  id: string;
  rule: RuleCode;
  entity: EntityRef;
  data: FindingData;
  explanation: string;
  proposal: string;
  fix: Fix | null;
}

export interface StoredFinding {
  id: string;
  rule: RuleCode;
  entity: EntityRef;
  fingerprint: string;
  explanation: string;
  proposal: string;
  fix: Fix | null;
  status: FindingStatus;
  detectedAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
}

/**
 * Algo que no cuadra, encontrado por una regla. Nace abierto; cada diagnóstico que lo reproduce lo «toca»; lo cierra
 * quien lo acepta (se aplica su arreglo) o lo descarta, o el propio diagnóstico cuando deja de reproducirse.
 */
export class Finding {
  private constructor(
    readonly id: string,
    readonly rule: RuleCode,
    readonly entity: EntityRef,
    readonly fingerprint: Fingerprint,
    readonly explanation: string,
    readonly proposal: string,
    readonly fix: Fix | null,
    private state: FindingStatus,
    readonly detectedAt: Date,
    private seenAt: Date,
    private closure: { at: Date; by: string | null } | null,
  ) {}

  static detect(detected: DetectedFinding, at: Date): Finding {
    return new Finding(
      detected.id,
      detected.rule,
      detected.entity,
      Fingerprint.of(detected.rule, detected.entity, detected.data),
      detected.explanation,
      detected.proposal,
      detected.fix,
      'open',
      at,
      at,
      null,
    );
  }

  static restore(stored: StoredFinding): Finding {
    return new Finding(
      stored.id,
      stored.rule,
      stored.entity,
      Fingerprint.fromString(stored.fingerprint),
      stored.explanation,
      stored.proposal,
      stored.fix,
      stored.status,
      stored.detectedAt,
      stored.lastSeenAt,
      stored.closedAt === null ? null : { at: stored.closedAt, by: stored.closedBy },
    );
  }

  severity(): Severity {
    return ruleDefinition(this.rule).severity;
  }

  status(): FindingStatus {
    return this.state;
  }

  lastSeenAt(): Date {
    return this.seenAt;
  }

  closedAt(): Date | null {
    return this.closure?.at ?? null;
  }

  closedBy(): string | null {
    return this.closure?.by ?? null;
  }

  /** Un diagnóstico posterior lo ha vuelto a encontrar. */
  touch(at: Date): void {
    this.ensureOpen();
    this.seenAt = at;
  }

  /** Lo que exige aceptar, sin cambiar nada: estar abierto y tener arreglo. */
  assertAcceptable(): void {
    this.ensureOpen();
    if (this.fix === null) throw new FindingHasNoFix();
  }

  accept(by: string, at: Date): void {
    this.assertAcceptable();
    this.close('accepted', at, by);
  }

  dismiss(by: string, at: Date): void {
    this.ensureOpen();
    this.close('dismissed', at, by);
  }

  /** Dejó de reproducirse: los datos ya cuadran. */
  resolve(at: Date): void {
    this.ensureOpen();
    this.close('resolved', at, null);
  }

  private close(status: FindingStatus, at: Date, by: string | null): void {
    this.state = status;
    this.closure = { at, by };
  }

  private ensureOpen(): void {
    if (this.state !== 'open') throw new FindingNotOpen();
  }
}

export interface DiagnosisRunFields {
  id: string;
  startedAt: Date;
  finishedAt: Date;
  /** Nombre de la cuenta que pulsó «Diagnosticar», o «Tarea nocturna». */
  launchedBy: string;
  openCount: number;
  newCount: number;
  resolvedCount: number;
}

/** Una ejecución del diagnóstico ya terminada, con sus contadores. */
export class DiagnosisRun {
  static readonly NIGHTLY = 'Tarea nocturna';

  private constructor(
    readonly id: string,
    readonly startedAt: Date,
    readonly finishedAt: Date,
    readonly launchedBy: string,
    readonly openCount: number,
    readonly newCount: number,
    readonly resolvedCount: number,
  ) {}

  static completed(fields: DiagnosisRunFields): DiagnosisRun {
    if (fields.finishedAt < fields.startedAt) {
      throw new Error('Un diagnóstico no puede terminar antes de empezar.');
    }
    return new DiagnosisRun(
      fields.id,
      fields.startedAt,
      fields.finishedAt,
      fields.launchedBy,
      fields.openCount,
      fields.newCount,
      fields.resolvedCount,
    );
  }
}
