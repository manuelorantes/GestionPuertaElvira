import { type LocalDate, Money, type YearMonth } from '../../src/domain/common/mod.ts';
import {
  BillingSettings,
  type Charge,
  type ChargeId,
  type ChargeKind,
  type Payment,
  type PaymentId,
  type StudentAccount,
  StudentRef,
} from '../../src/domain/billing/mod.ts';
import type {
  BillingSettingsRepository,
  BillingStudent,
  ChargeRepository,
  DocumentSequence,
  PaymentRepository,
  PrivateEnrolment,
  StudentAccountRepository,
  StudentDirectory,
} from '../../src/application/billing/mod.ts';
import type { ClosedPeriods, Locks } from '../../src/application/common/mod.ts';
import { ImmediateTransactionRunner } from './classes.ts';
import { FrozenClock } from './identity.ts';

/** Doble de los bloqueos: apunta las claves pedidas. */
export class RecordingLocks implements Locks {
  keys: string[] = [];

  acquire(key: string): Promise<void> {
    this.keys.push(key);
    return Promise.resolve();
  }
}

/** Dobles en memoria de todos los puertos de Billing. */
export class BillingFixture
  implements
    ClosedPeriods,
    BillingSettingsRepository,
    StudentAccountRepository,
    ChargeRepository,
    PaymentRepository,
    DocumentSequence,
    StudentDirectory {
  settings = BillingSettings.defaults();
  accounts = new Map<string, StudentAccount>();
  charges = new Map<string, Charge>();
  payments = new Map<string, Payment>();
  sequences = new Map<string, number>();
  students = new Map<string, BillingStudent>();
  /** Fechas de temporadas cerradas. */
  closedDates: string[] = [];
  readonly clock: FrozenClock;
  readonly transactions = new ImmediateTransactionRunner();
  readonly locks = new RecordingLocks();

  constructor(now = '2026-10-02T10:00:00+02:00') {
    this.clock = new FrozenClock(now);
  }

  student(
    options: {
      name?: string;
      regularHours?: number;
      privateLessons?: PrivateEnrolment[];
      siblings?: boolean;
    } = {},
  ): string {
    const id = StudentRef.generate().value;
    this.students.set(id, {
      id,
      name: options.name ?? 'Martina López Herrera',
      guardianName: 'Rocío Herrera',
      guardianPhone: '612 48 19 30',
      hasSiblings: options.siblings ?? false,
      regularWeeklyHours: options.regularHours ?? 2,
      privateLessons: options.privateLessons ?? [],
    });
    return id;
  }

  /** Cambia los grupos del alumno (p. ej. sube de nivel o se da de baja). */
  changeHours(id: string, regularHours: number): void {
    const s = this.students.get(id);
    if (s) this.students.set(id, { ...s, regularWeeklyHours: regularHours });
  }

  get(): Promise<BillingSettings> {
    return Promise.resolve(this.settings);
  }

  saveSettings(settings: BillingSettings): Promise<void> {
    this.settings = settings;
    return Promise.resolve();
  }

  account(student: StudentRef): Promise<StudentAccount | null> {
    return Promise.resolve(this.accounts.get(student.value) ?? null);
  }

  accountsOf(students: StudentRef[]): Promise<Map<string, StudentAccount>> {
    const ids = new Set(students.map((s) => s.value));
    return Promise.resolve(new Map([...this.accounts].filter(([id]) => ids.has(id))));
  }

  saveAccount(account: StudentAccount): Promise<void> {
    this.accounts.set(account.student.value, account);
    return Promise.resolve();
  }

  charge(id: ChargeId): Promise<Charge | null> {
    return Promise.resolve(this.charges.get(id.value) ?? null);
  }

  chargeFor(student: StudentRef, kind: ChargeKind, period: YearMonth): Promise<Charge | null> {
    return Promise.resolve(
      [...this.charges.values()].find((c) =>
        c.student.equals(student) && c.kind === kind && c.period.equals(period)
      ) ?? null,
    );
  }

  chargedStudents(kind: ChargeKind, period: YearMonth): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        [...this.charges.values()]
          .filter((c) => c.kind === kind && c.period.equals(period))
          .map((c) => c.student.value),
      ),
    );
  }

  allFor(student: StudentRef, kind: ChargeKind): Promise<Charge[]> {
    return Promise.resolve(
      [...this.charges.values()]
        .filter((c) => c.student.equals(student) && c.kind === kind)
        .sort((a, b) => a.period.toString().localeCompare(b.period.toString())),
    );
  }

  creditFor(student: StudentRef, kind: ChargeKind): Promise<Money> {
    return Promise.resolve(
      [...this.payments.values()]
        .filter((p) => p.student.equals(student) && p.kind === kind)
        .reduce((sum, p) => sum.plus(p.credit), Money.zero()),
    );
  }

  saveCharge(charge: Charge): Promise<void> {
    this.charges.set(charge.id.value, charge);
    return Promise.resolve();
  }

  payment(id: PaymentId): Promise<Payment | null> {
    return Promise.resolve(this.payments.get(id.value) ?? null);
  }

  savePayment(payment: Payment): Promise<void> {
    this.payments.set(payment.id.value, payment);
    return Promise.resolve();
  }

  next(prefix: string, seasonYear: number): Promise<number> {
    const key = `${prefix}${seasonYear}`;
    const value = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, value);
    return Promise.resolve(value);
  }

  activeIn(): Promise<BillingStudent[]> {
    return Promise.resolve([...this.students.values()]);
  }

  find(student: StudentRef): Promise<BillingStudent | null> {
    return Promise.resolve(this.students.get(student.value) ?? null);
  }

  isClosed(date: LocalDate): Promise<boolean> {
    return Promise.resolve(this.closedDates.includes(date.toString()));
  }
}
