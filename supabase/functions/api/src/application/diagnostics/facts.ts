// Los hechos sobre los que se ejecutan las reglas del diagnóstico: una foto de solo lectura de lo que hay en los
// demás contextos, cargada una vez por diagnóstico. Las reglas son funciones puras sobre esta estructura.

import type { EntityRef, FindingData, Fix, RuleCode } from '../../domain/diagnostics/mod.ts';

export interface FactStudent {
  id: string;
  memberNumber: number;
  fullName: string;
  status: 'active' | 'withdrawn';
  age: number | null;
  contactEmail: string | null;
  guardians: { name: string; phone: string | null }[];
  ownPhone: string | null;
  /** Última alta en el club («AAAA-MM-DD»). */
  joinedOn: string;
  withdrawnOn: string | null;
  /** Grupos en los que está hoy, con desde cuándo. */
  groups: { id: string; name: string; since: string }[];
  siblingIds: string[];
  /** Horas semanales reales (con su horario especial). */
  weeklyHours: number;
  /** Tramo por sus horas, antes de descuentos (0 sin grupos). */
  tierCents: number;
  /** Lo que suman al mes sus clases particulares, antes de descuentos (0 si no tiene). */
  privateLessonsCents: number;
  /** Cuota de un mes de hoy, ya con el descuento familiar si lo tiene. */
  feeCents: number;
  familyDiscount: boolean;
  /** Porcentaje del descuento familiar de la tarifa (se aplique o no a este alumno). */
  familyPercent: number;
}

export type FactChargeStatus = 'paid' | 'partial' | 'due' | 'overdue' | 'expected' | 'cancelled';

export interface FactCharge {
  id: string;
  studentId: string;
  kind: 'monthly' | 'membership' | 'material';
  /** «AAAA-MM». */
  period: string;
  amountCents: number;
  coveredCents: number;
  status: FactChargeStatus;
  manual: boolean;
  /** Descuento por pago adelantado apuntado en la cuota (0 si no tiene). */
  discountPercent: number;
}

export interface FactPayment {
  id: string;
  receiptNumber: string;
  /** Temporada y número correlativo del recibo. */
  seasonYear: number;
  sequence: number;
  paidOn: string;
  studentId: string;
  kind: string;
  totalCents: number;
}

export interface FactLedgerLine {
  source: string;
  sourceId: string;
  date: string;
  kind: 'income' | 'expense';
  amountCents: number;
}

export interface FactEntry {
  id: string;
  date: string;
  kind: 'income' | 'expense';
  concept: string;
  category: string;
  amountCents: number;
  /** Mes al que corresponde. */
  period: string;
}

export interface FactInvoice {
  id: string;
  date: string;
  supplier: string;
  concept: string;
  category: string;
  amountCents: number;
  period: string;
  paidOn: string | null;
}

export interface FactCategory {
  code: string;
  label: string;
  kind: 'income' | 'expense';
}

export interface FactTeacher {
  id: string;
  fullName: string;
  active: boolean;
}

/** Un profesor en un mes: sus horas apuntadas, su liquidación (si existe) y los ingresos que se le atribuyen. */
export interface FactTeacherMonth {
  teacherId: string;
  teacherName: string;
  month: string;
  sessionMinutes: number;
  sessionCostCents: number;
  settlement: { minutes: number; amountCents: number; paid: boolean } | null;
  incomeCents: number;
}

export interface FactPoints {
  studentId: string;
  studentName: string;
  month: string;
  /** Saldo del mes según la sección Puntos. */
  points: number;
  /** Suma de los movimientos del mes. */
  movementsSum: number;
}

export interface Facts {
  today: string;
  /** Mes en curso («AAAA-MM») y la temporada a la que pertenece. */
  currentMonth: string;
  seasonYear: number;
  /** Meses de clase de la temporada (septiembre a junio), en orden. */
  seasonMonths: string[];
  /** Descuentos de pago adelantado de la tarifa: desde cuántos meses y qué porcentaje (3, 6 y 9 meses). */
  prepayments: { months: number; percent: number }[];
  students: FactStudent[];
  charges: FactCharge[];
  payments: FactPayment[];
  /** Movimientos del libro de los meses de la temporada hasta el actual. */
  ledger: FactLedgerLine[];
  entries: FactEntry[];
  invoices: FactInvoice[];
  categories: FactCategory[];
  teachers: FactTeacher[];
  teacherMonths: FactTeacherMonth[];
  points: FactPoints[];
}

/** Lo que una regla encuentra: a quién afecta, los datos que lo identifican y cómo se explica y se arregla. */
export interface Candidate {
  rule: RuleCode;
  entity: EntityRef;
  data: FindingData;
  explanation: string;
  proposal: string;
  fix: Fix | null;
}

export type Rule = (facts: Facts) => Candidate[];

export interface FactsSource {
  load(): Promise<Facts>;
}
