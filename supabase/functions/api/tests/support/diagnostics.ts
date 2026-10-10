// Hechos en memoria para probar las reglas y los casos de uso del diagnóstico. Todos los datos son ficticios.
import { DiagnosisRun, Finding, type FindingStatus } from '../../src/domain/diagnostics/mod.ts';
import type {
  FactCharge,
  FactEntry,
  FactInvoice,
  FactPayment,
  Facts,
  FactStudent,
  FactTeacherMonth,
  FindingRepository,
  RunLog,
} from '../../src/application/diagnostics/mod.ts';

export const TODAY = '2026-10-10';
export const SEASON_MONTHS = [
  '2026-09',
  '2026-10',
  '2026-11',
  '2026-12',
  '2027-01',
  '2027-02',
  '2027-03',
  '2027-04',
  '2027-05',
  '2027-06',
];

export function factsWith(overrides: Partial<Facts> = {}): Facts {
  return {
    today: TODAY,
    currentMonth: '2026-10',
    seasonYear: 2026,
    seasonMonths: SEASON_MONTHS,
    prepayments: [{ months: 3, percent: 10 }, { months: 6, percent: 15 }, {
      months: 9,
      percent: 20,
    }],
    students: [],
    charges: [],
    payments: [],
    ledger: [],
    entries: [],
    invoices: [],
    categories: [
      { code: 'fees', label: 'Cuotas', kind: 'income' },
      { code: 'teachers', label: 'Profesores', kind: 'expense' },
      { code: 'rent', label: 'Alquiler', kind: 'expense' },
      { code: 'cleaning', label: 'Limpieza', kind: 'expense' },
      { code: 'president', label: 'Presidente', kind: 'expense' },
      { code: 'water', label: 'Agua', kind: 'expense' },
      { code: 'electricity', label: 'Electricidad', kind: 'expense' },
      { code: 'internet', label: 'Wifi', kind: 'expense' },
      { code: 'utilities', label: 'Suministros', kind: 'expense' },
      { code: 'other_expenses', label: 'Otros gastos', kind: 'expense' },
    ],
    teachers: [],
    teacherMonths: [],
    points: [],
    ...overrides,
  };
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

/** Alumna activa, 2 h semanales (45 €), sin familia, en un grupo desde el 1 de septiembre. */
export function student(overrides: Partial<FactStudent> = {}): FactStudent {
  const id = overrides.id ?? nextId('student');
  const number = ++counter;
  return {
    id,
    memberNumber: overrides.memberNumber ?? number,
    fullName: 'Martina López Herrera',
    status: 'active',
    age: 12,
    contactEmail: null,
    // Cada alumna de prueba tiene su propia tutora con su propio teléfono.
    guardians: [{ name: 'Rocío Herrera', phone: `6${String(number).padStart(8, '0')}` }],
    ownPhone: null,
    joinedOn: '2026-09-01',
    withdrawnOn: null,
    groups: [{ id: 'g1', name: 'Lunes 17:00 · Iniciación · Peón', since: '2026-09-01' }],
    siblingIds: [],
    weeklyHours: 2,
    tierCents: 4500,
    privateLessonsCents: 0,
    feeCents: 4500,
    familyDiscount: false,
    familyPercent: 10,
    ...overrides,
  };
}

export function charge(overrides: Partial<FactCharge> & { studentId: string }): FactCharge {
  return {
    id: nextId('charge'),
    kind: 'monthly',
    period: '2026-10',
    amountCents: 4500,
    coveredCents: 0,
    status: 'due',
    manual: false,
    discountPercent: 0,
    ...overrides,
  };
}

export function payment(overrides: Partial<FactPayment> & { studentId: string }): FactPayment {
  const sequence = overrides.sequence ?? ++counter;
  return {
    id: nextId('payment'),
    receiptNumber: `R-2026-${String(sequence).padStart(4, '0')}`,
    seasonYear: 2026,
    sequence,
    paidOn: '2026-10-03',
    kind: 'monthly',
    totalCents: 4500,
    ...overrides,
  };
}

export function entry(overrides: Partial<FactEntry> = {}): FactEntry {
  return {
    id: nextId('entry'),
    date: '2026-09-30',
    kind: 'expense',
    concept: 'Gasto',
    category: 'other_expenses',
    amountCents: 1000,
    period: '2026-09',
    ...overrides,
  };
}

export function invoice(overrides: Partial<FactInvoice> = {}): FactInvoice {
  return {
    id: nextId('invoice'),
    date: '2026-09-30',
    supplier: 'Proveedor',
    concept: 'Servicio',
    category: 'other_expenses',
    amountCents: 1000,
    period: '2026-09',
    paidOn: null,
    ...overrides,
  };
}

export function teacherMonth(
  overrides: Partial<FactTeacherMonth> & { teacherId: string },
): FactTeacherMonth {
  return {
    teacherName: 'Lucía Moreno Gil',
    month: '2026-09',
    sessionMinutes: 0,
    sessionCostCents: 0,
    settlement: null,
    incomeCents: 0,
    ...overrides,
  };
}

/** Repositorio de hallazgos y registro de diagnósticos en memoria. */
export class DiagnosticsFixture implements FindingRepository, RunLog {
  findings = new Map<string, Finding>();
  runs: DiagnosisRun[] = [];

  open(): Promise<Finding[]> {
    return Promise.resolve([...this.findings.values()].filter((f) => f.status() === 'open'));
  }

  dismissedFingerprints(): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        [...this.findings.values()].filter((f) => f.status() === 'dismissed').map((f) =>
          f.fingerprint.value
        ),
      ),
    );
  }

  byId(id: string): Promise<Finding | null> {
    return Promise.resolve(this.findings.get(id) ?? null);
  }

  save(finding: Finding): Promise<void> {
    this.findings.set(finding.id, finding);
    return Promise.resolve();
  }

  async saveAll(findings: Finding[]): Promise<void> {
    for (const finding of findings) await this.save(finding);
  }

  list(status: FindingStatus): Promise<Finding[]> {
    return Promise.resolve([...this.findings.values()].filter((f) => f.status() === status));
  }

  saveRun(run: DiagnosisRun): Promise<void> {
    this.runs.push(run);
    return Promise.resolve();
  }

  lastRun(): Promise<DiagnosisRun | null> {
    return Promise.resolve(this.runs.at(-1) ?? null);
  }

  all(): Finding[] {
    return [...this.findings.values()];
  }
}
