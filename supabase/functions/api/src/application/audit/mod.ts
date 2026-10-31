import { type HasErrorDetails, InvalidValue, LocalDate } from '../../domain/common/mod.ts';
import type { Locks, TransactionRunner } from '../common/mod.ts';

/**
 * La parte de la aplicación a la que pertenece una acción, en el orden de sus secciones: por ella se filtra el
 * historial (las acciones concretas son demasiadas para elegir entre ellas).
 */
export const AUDIT_CATEGORIES = [
  'students',
  'groups',
  'charges',
  'payments',
  'attendance',
  'points',
  'teachers',
  'payroll',
  'accounting',
  'equipment',
  'system',
] as const;

export type AuditCategory = typeof AUDIT_CATEGORIES[number];

export function auditCategoryFrom(value: string): AuditCategory {
  if (!AUDIT_CATEGORIES.includes(value as AuditCategory)) {
    throw new InvalidValue('category', 'Categoría desconocida.');
  }
  return value as AuditCategory;
}

/** Una acción del historial: quién, cuándo, qué y cuántos registros tocó. */
export interface AuditActionView {
  id: string;
  seq: number;
  kind: string;
  category: string;
  userId: string | null;
  userName: string;
  label: string;
  /** A quién o a qué afectó («Cuota de octubre 2026 · Martina López Herrera»); null si no se sabe decir. */
  detail: string | null;
  occurredAt: string;
  changeCount: number;
  /** Nombres legibles de lo que tocó (p. ej. «Cobro», «Cuota»). */
  affected: string[];
  reverts: string | null;
  undoable: boolean;
}

/** Dónde se ve o se gestiona en la aplicación lo que tocó un cambio. */
export type AuditTarget =
  | { kind: 'payment' | 'student' | 'group' | 'teacher'; id: string }
  | { kind: 'charges' | 'ledger' | 'settlement'; month: string }
  | { kind: 'hours'; month: string; teacherId: string }
  | { kind: 'invoices' | 'billing-settings' };

/** Un registro tocado por una acción, con los campos que cambiaron (sin contraseñas ni columnas internas). */
export interface AuditChangeView {
  table: string;
  tableLabel: string;
  /** Cómo se llama lo tocado («R-2026-0401 · Martina López Herrera»); null si no hay nada mejor que la tabla. */
  title: string | null;
  key: Record<string, unknown>;
  operation: string;
  fields: { field: string; before: unknown; after: unknown }[];
  /** null si no hay dónde ir (p. ej. el registro se borró o es una cuenta de usuario). */
  target: AuditTarget | null;
}

export type AuditReferenceKind =
  | 'student'
  | 'teacher'
  | 'group'
  | 'user'
  | 'payment'
  | 'charge'
  | 'product'
  | 'order'
  | 'duty';

/** Un registro al que apunta algún campo del detalle: su nombre y dónde verlo. */
export interface AuditReference {
  kind: AuditReferenceKind;
  label: string;
  target: AuditTarget | null;
}

/** Un grupo en el que estaba un alumno, con su nombre. */
export interface AuditGroupStay extends GroupStay {
  groupName: string;
}

/** Todos los grupos de un alumno justo antes y justo después de una acción que tocó sus inscripciones. */
export interface AuditStudentGroups {
  studentId: string;
  studentName: string;
  before: AuditGroupStay[];
  after: AuditGroupStay[];
}

/** El detalle de una acción: sus cambios y, por identificador, los registros que mencionan. */
export interface AuditDetail {
  changes: AuditChangeView[];
  references: Record<string, AuditReference>;
  /** Por cada alumno cuyas inscripciones tocó la acción, sus grupos antes y después. */
  studentGroups: AuditStudentGroups[];
}

/** Una inscripción tal como la guarda el historial, con lo que hace falta para saber en qué grupos está alguien. */
export interface EnrolmentSnapshot {
  id: string;
  studentId: string;
  groupId: string;
  /** Fechas «AAAA-MM-DD». */
  enrolledOn: string;
  endsOn: string | null;
}

/** Un cambio registrado de una inscripción: null antes si se creó, null después si se borró. */
export interface EnrolmentChange {
  before: EnrolmentSnapshot | null;
  after: EnrolmentSnapshot | null;
}

/** Un grupo en el que estaba un alumno un día: «desde» si aún no había empezado, «hasta» si ya tenía fin. */
export interface GroupStay {
  groupId: string;
  startsOn: string | null;
  endsOn: string | null;
}

/** Los grupos de un alumno antes y después de una acción, sin nombres. */
export interface StudentGroupsAround {
  studentId: string;
  before: GroupStay[];
  after: GroupStay[];
}

/**
 * En qué grupos estaba cada alumno que tocó una acción, justo antes y justo después de ella. Se parte de las
 * inscripciones de hoy y se deshacen sobre el papel, del más reciente al más antiguo, los cambios posteriores (queda
 * el estado tras la acción) y luego los de la propia acción (queda el de antes). Así lo que pasó después, incluido
 * deshacerla, no cambia la respuesta. Cuenta la inscripción que seguía en vigor el día de la acción (`day`).
 */
export function groupsAroundAction(input: {
  day: string;
  current: readonly EnrolmentSnapshot[];
  /** Cambios de las acciones posteriores, en el orden en que pasaron. */
  later: readonly EnrolmentChange[];
  /** Cambios de la propia acción, en el orden en que pasaron. */
  own: readonly EnrolmentChange[];
}): StudentGroupsAround[] {
  const state = new Map(input.current.map((e) => [e.id, e]));
  const rollBack = (changes: readonly EnrolmentChange[]) => {
    for (const change of [...changes].reverse()) {
      const id = (change.before ?? change.after)?.id;
      if (id === undefined) continue;
      if (change.before === null) state.delete(id);
      else state.set(id, change.before);
    }
  };
  const groupsOf = (studentId: string): GroupStay[] =>
    [...state.values()]
      .filter((e) => e.studentId === studentId && (e.endsOn === null || e.endsOn > input.day))
      .sort((a, b) =>
        a.enrolledOn.localeCompare(b.enrolledOn) || a.groupId.localeCompare(b.groupId)
      )
      .map((e) => ({
        groupId: e.groupId,
        startsOn: e.enrolledOn > input.day ? e.enrolledOn : null,
        endsOn: e.endsOn,
      }));

  const students = [
    ...new Set(
      input.own.flatMap((c) => [c.before?.studentId, c.after?.studentId]).filter(
        (id): id is string => id !== undefined,
      ),
    ),
  ];
  rollBack(input.later);
  const after = new Map(students.map((id) => [id, groupsOf(id)]));
  rollBack(input.own);
  return students.map((studentId) => ({
    studentId,
    before: groupsOf(studentId),
    after: after.get(studentId) ?? [],
  }));
}

/** Una sección del historial: las acciones que tocaron alguna de sus tablas. */
export type AuditSection = 'students' | 'payments' | 'attendance';

export const SECTION_TABLES: Record<AuditSection, readonly string[]> = {
  // Datos, altas y bajas, grupos (inscripciones) y datos de cobro de los alumnos.
  students: [
    'students_student',
    'students_past_membership',
    'classes_enrolment',
    'billing_account',
  ],
  payments: ['billing_payment'],
  // Listas, faltas, asistencias especiales, confirmaciones y las notas (comentarios) de las clases.
  attendance: [
    'attendance_roll_call',
    'attendance_absence',
    'attendance_guest',
    'attendance_activity_check',
    'attendance_comment',
  ],
};

export function auditSectionFrom(value: string): AuditSection {
  if (!(value in SECTION_TABLES)) throw new InvalidValue('section', 'Sección desconocida.');
  return value as AuditSection;
}

export type AuditPeriod = 'today' | 'week' | 'month' | 'all';

const PERIODS: readonly AuditPeriod[] = ['today', 'week', 'month', 'all'];

export function auditPeriodFrom(value: string): AuditPeriod {
  if (!PERIODS.includes(value as AuditPeriod)) {
    throw new InvalidValue('period', 'Periodo desconocido.');
  }
  return value as AuditPeriod;
}

/** El primer día de un periodo (hoy, el lunes o el día 1); null si abarca todo. */
export function periodFirstDay(period: AuditPeriod, now: Date): LocalDate | null {
  const today = LocalDate.fromInstant(now);
  switch (period) {
    case 'today':
      return today;
    case 'week':
      return today.startOfWeek();
    case 'month':
      return today.startOfMonth();
    case 'all':
      return null;
  }
}

/** Desde qué instante (hora de Madrid) abarca un periodo; null si abarca todo. */
export function periodStart(period: AuditPeriod, now: Date): Date | null {
  return periodFirstDay(period, now)?.startInMadrid() ?? null;
}

export interface AuditFilter {
  userId?: string | null;
  beforeSeq?: number | null;
  limit?: number;
  /** Solo las acciones que tocaron alguna de estas tablas (null: todas). */
  tables?: readonly string[] | null;
  /** Solo las acciones desde este instante (null: desde siempre). */
  since?: Date | null;
  /** Solo las acciones de alguna de estas categorías (null: todas). */
  categories?: readonly AuditCategory[] | null;
  /** Solo las clases desde este día (null: todas); ver `classes`. */
  sinceDay?: LocalDate | null;
}

/** Una nota de una clase tal como está ahora. */
export interface AuditClassNote {
  id: string;
  studentName: string | null;
  text: string;
  author: string;
}

/** Una clase (grupo y día, o turno de encargado y día) con todo lo que el historial registró de ella. */
export interface AuditClassView {
  groupId: string | null;
  label: string;
  date: string;
  /** De la más reciente a la más antigua. */
  actions: AuditActionView[];
  notes: AuditClassNote[];
}

/** Un cobro tal como lo registró (o lo quitó, al deshacer) una acción: el importe lleva el signo. */
export interface AuditPaymentView extends AuditActionView {
  paymentId: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  concept: string;
  method: string;
  totalCents: number;
}

export interface AuditPaymentsPage {
  items: AuditPaymentView[];
  /** Suma de todo el periodo, no solo de la página. */
  totalCents: number;
}

export interface AuditLog {
  /** Acciones del historial, de la más reciente a la más antigua. */
  actions(filter: AuditFilter): Promise<AuditActionView[]>;
  /** Cobros registrados o deshechos, de la más reciente a la más antigua, con la suma del periodo. */
  payments(filter: AuditFilter): Promise<AuditPaymentsPage>;
  /** Las clases que tocaron las acciones de asistencia (por `tables` y `sinceDay`), de la más reciente a la más antigua. */
  classes(filter: AuditFilter): Promise<AuditClassView[]>;
  action(id: string): Promise<AuditActionView | null>;
  changes(actionId: string): Promise<AuditDetail>;
  /** Personas que aparecen en el historial. */
  people(): Promise<{ id: string; name: string }[]>;
  /** Las categorías con acciones que cumplen `filter` (sin mirar `categories`), en su orden y cuántas hay de cada. */
  categories(filter: AuditFilter): Promise<{ category: AuditCategory; count: number }[]>;
}

/** Reversión de cambios registrados. Se usa dentro de una transacción. */
export interface AuditReverter {
  /** Abre la acción que firma la reversión, en la categoría de lo que revierte (sus cambios quedan registrados con ella). */
  begin(label: string, kind: string, reverts: string): Promise<void>;
  /** Cambios revertibles de la acción, del más reciente al más antiguo. */
  changesOf(actionId: string): Promise<number[]>;
  /** Cambios revertibles posteriores a la acción, del más reciente al más antiguo. */
  changesAfter(actionId: string): Promise<number[]>;
  /** Acciones posteriores que tocaron alguno de los registros de esta. */
  laterActionsTouchingTheSameRecords(actionId: string): Promise<AuditActionView[]>;
  revert(changeId: number): Promise<void>;
}

export class AuditActionNotFound extends Error {
  constructor() {
    super('No existe esa acción del historial.');
    this.name = 'AuditActionNotFound';
  }
}

export class NothingToUndo extends Error {
  constructor() {
    super('Esa acción no tiene cambios que se puedan deshacer.');
    this.name = 'NothingToUndo';
  }
}

/** Una acción posterior tocó los mismos registros: deshacer esta rompería la posterior. */
export class UndoConflict extends Error implements HasErrorDetails {
  constructor(private readonly later: AuditActionView[]) {
    const first = later[0];
    super(
      first
        ? `No se puede deshacer: «${first.label}» (${first.userName}) tocó después los mismos registros. Deshaz antes esa o vuelve a este punto.`
        : 'Una acción posterior tocó los mismos registros.',
    );
    this.name = 'UndoConflict';
  }

  details(): Record<string, string> {
    return { conflicts: this.later.map((a) => a.id).join(', ') };
  }
}

/** Deshace una acción concreta, siempre que nada posterior haya tocado sus registros. */
export class UndoAction {
  constructor(
    private readonly log: AuditLog,
    private readonly reverter: AuditReverter,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  execute(actionId: string): Promise<void> {
    return this.transactions.run(async () => {
      await this.locks.acquire('audit:revert');
      const action = await this.log.action(actionId);
      if (action === null) throw new AuditActionNotFound();
      const changes = await this.reverter.changesOf(actionId);
      if (changes.length === 0) throw new NothingToUndo();
      const later = await this.reverter.laterActionsTouchingTheSameRecords(actionId);
      if (later.length > 0) throw new UndoConflict(later);
      await this.reverter.begin(`Deshacer: ${action.label}`, 'undo', actionId);
      for (const change of changes) await this.reverter.revert(change);
    });
  }
}

/** Devuelve todos los datos del club al estado justo después de una acción, deshaciendo todo lo posterior. */
export class RestoreToPoint {
  constructor(
    private readonly log: AuditLog,
    private readonly reverter: AuditReverter,
    private readonly transactions: TransactionRunner,
    private readonly locks: Locks,
  ) {}

  /** @returns cambios revertidos */
  execute(actionId: string): Promise<number> {
    return this.transactions.run(async () => {
      await this.locks.acquire('audit:revert');
      const action = await this.log.action(actionId);
      if (action === null) throw new AuditActionNotFound();
      const changes = await this.reverter.changesAfter(actionId);
      if (changes.length === 0) throw new NothingToUndo();
      await this.reverter.begin(
        `Volver al punto: ${action.label} (${action.userName})`,
        'restore',
        actionId,
      );
      for (const change of changes) await this.reverter.revert(change);
      return changes.length;
    });
  }
}
