import {
  type Clock,
  EmailAddress,
  type HasErrorDetails,
  InvalidValue,
  LocalDate,
  Money,
  PhoneNumber,
  Season,
  YearMonth,
} from '../../domain/common/mod.ts';
import { StudentAccount, StudentRef } from '../../domain/billing/mod.ts';
import type { RecordEntry } from '../accounting/mod.ts';
import type { ImportPayment, StudentAccountRepository } from '../billing/mod.ts';
import type { AuditContext, TransactionRunner } from '../common/mod.ts';
import type { RegisterStudent } from '../students/mod.ts';

// ---- Lectura de la hoja ----------------------------------------------------------------------

/** Una fila de la hoja ya interpretada. Lo que no se entiende queda vacío y explicado en `warnings`. */
export interface ImportedRow {
  line: number;
  fullName: string;
  birthDate: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  email: string | null;
  membershipCents: number | null;
  kitCents: number | null;
  federationCents: number | null;
  /** Cobrado cada mes (AAAA-MM → céntimos). */
  monthlyCents: Record<string, number>;
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
};

/** Minúsculas, sin tildes y con un solo espacio entre palabras. */
export function normaliseText(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/\s+/gu, ' ')
    .trim();
}

/** Una línea CSV con el delimitador dado, respetando las comillas. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** «49,5» o «49.50» (con o sin €) → céntimos; null si no es un número. */
function cents(raw: string): number | null {
  let clean = raw.replace(/[ €]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) clean = clean.replace(/\./g, '');
  clean = clean.replace(',', '.');
  return clean !== '' && /^-?\d+(\.\d+)?$/.test(clean) ? Math.round(Number(clean) * 100) : null;
}

function validDate(iso: string): string | null {
  try {
    return LocalDate.fromString(iso).toString();
  } catch (error) {
    if (error instanceof InvalidValue) return null;
    throw error;
  }
}

/** «7/2/17», «30/5/2015» o «2015-05-30» → ISO; los años de dos cifras son del siglo actual si no quedan en el futuro. */
function parseDate(raw: string, today: LocalDate): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return validDate(raw);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(raw);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) {
    year += Math.floor(today.year / 100) * 100;
    if (year > today.year) year -= 100;
  }
  return validDate(
    `${String(year).padStart(4, '0')}-${String(Number(m[2])).padStart(2, '0')}-${
      String(Number(m[1])).padStart(2, '0')
    }`,
  );
}

/**
 * Lee la hoja del club (CSV con coma o punto y coma, o celdas pegadas con tabulador).
 * Reconoce las columnas por su cabecera; la primera columna es el nombre. Fotos, Tarjetero y banco se ignoran.
 */
export class SpreadsheetParser {
  parse(text: string, today: LocalDate): ImportedRow[] {
    const lines = text.trim().split(/\r\n|\r|\n/);
    const delimiter = text.includes('\t')
      ? '\t'
      : (text.split(';').length > text.split(',').length ? ';' : ',');
    let header: Map<string, number> | null = null;
    const rows: ImportedRow[] = [];
    lines.forEach((line, index) => {
      const cells = splitCsvLine(line, delimiter);
      if (header === null) {
        if (SpreadsheetParser.looksLikeHeader(cells)) header = SpreadsheetParser.columns(cells);
        return;
      }
      if ((cells[0] ?? '') === '') return;
      rows.push(SpreadsheetParser.row(index + 1, cells, header, today));
    });
    if (header === null) {
      throw new InvalidValue(
        'text',
        'No se reconoce la cabecera: hace falta una fila con «Septiembre» o «Fecha de nacimiento».',
      );
    }
    return rows;
  }

  private static row(
    line: number,
    cells: string[],
    columns: Map<string, number>,
    today: LocalDate,
  ): ImportedRow {
    const warnings: string[] = [];
    const cell = (key: string): string => {
      const index = columns.get(key);
      return index === undefined ? '' : cells[index] ?? '';
    };
    const amount = (key: string): number | null => {
      const raw = cell(key);
      if (raw === '') return null;
      const value = cents(raw);
      if (value === null) warnings.push(`«${raw}» no es un importe (${key}).`);
      return value;
    };
    const season = Season.containing(YearMonth.of(today));
    const monthly: Record<string, number> = {};
    for (const [name, number] of Object.entries(MONTHS)) {
      const value = amount(name);
      if (value !== null && value > 0) {
        monthly[
          `${String(number >= 9 ? season.startYear : season.startYear + 1).padStart(4, '0')}-${
            String(number).padStart(2, '0')
          }`
        ] = value;
      }
    }
    const birth = parseDate(cell('birth'), today);
    if (cell('birth') !== '' && birth === null) {
      warnings.push(`«${cell('birth')}» no es una fecha de nacimiento válida.`);
    }
    let phone: string | null = null;
    if (cell('phone') !== '') {
      try {
        phone = PhoneNumber.fromString(cell('phone')).value.replace(/\D/g, '');
      } catch (error) {
        if (!(error instanceof InvalidValue)) throw error;
        warnings.push(`«${cell('phone')}» no es un teléfono válido.`);
      }
    }
    let email: string | null = null;
    if (cell('email') !== '') {
      try {
        email = EmailAddress.fromString(cell('email')).value;
      } catch (error) {
        if (!(error instanceof InvalidValue)) throw error;
        warnings.push(`«${cell('email')}» no es un email válido.`);
      }
    }
    return {
      line,
      fullName: (cells[0] ?? '').replace(/\s+/gu, ' ').trim(),
      birthDate: birth,
      guardianName: cell('guardian') === '' ? null : cell('guardian'),
      guardianPhone: phone,
      email,
      membershipCents: amount('membership'),
      kitCents: amount('kit'),
      federationCents: amount('federation'),
      monthlyCents: monthly,
      warnings,
    };
  }

  private static looksLikeHeader(cells: string[]): boolean {
    const joined = normaliseText(cells.join(' '));
    return joined.includes('septiembre') || joined.includes('nacimien');
  }

  /** Clave lógica → índice de columna. */
  private static columns(cells: string[]): Map<string, number> {
    const columns = new Map<string, number>();
    cells.forEach((raw, index) => {
      const h = normaliseText(raw);
      let key: string | null = null;
      if (h === '') key = null;
      else if (h in MONTHS) key = h;
      else if (h.includes('cuota')) key = 'membership';
      else if (h.includes('polo') || h.includes('chandal')) key = 'kit';
      else if (h.includes('federa')) key = 'federation';
      else if (h.includes('nacimien')) key = 'birth';
      else if (h.includes('madre') || h.includes('padre') || h.includes('tutor')) key = 'guardian';
      else if (h.includes('telef') || h.includes('movil')) key = 'phone';
      else if (h.includes('mail')) key = 'email';
      if (key !== null && !columns.has(key)) columns.set(key, index);
    });
    return columns;
  }
}

// ---- Revisión e importación ------------------------------------------------------------------

export interface StudentCandidate {
  id: string;
  fullName: string;
}

/** Alumnos existentes con los que vincular cada fila de la hoja. */
export interface StudentMatcher {
  /** Alumno con exactamente ese nombre (sin tildes ni mayúsculas), o null. */
  byName(fullName: string): Promise<StudentCandidate | null>;
  /** Hasta tres alumnos parecidos, los más parecidos primero. */
  similar(fullName: string): Promise<StudentCandidate[]>;
  exists(studentId: string): Promise<boolean>;
}

/** Fila de la revisión: lo leído, con quién coincide y qué se propone. */
export interface ImportPreviewRow {
  row: ImportedRow;
  match: StudentCandidate | null;
  suggestions: StudentCandidate[];
}

/** Lee la hoja y la casa con los alumnos existentes, sin guardar nada. */
export class PreviewImport {
  constructor(
    private readonly parser: SpreadsheetParser,
    private readonly students: StudentMatcher,
    private readonly clock: Clock,
  ) {}

  async execute(text: string): Promise<ImportPreviewRow[]> {
    const today = LocalDate.fromInstant(this.clock.now());
    const rows: ImportPreviewRow[] = [];
    for (const row of this.parser.parse(text, today)) {
      const match = await this.students.byName(row.fullName);
      rows.push({
        row,
        match,
        suggestions: match === null ? await this.students.similar(row.fullName) : [],
      });
    }
    return rows;
  }
}

/** Antes de crear un alumno se avisa de que ya hay uno parecido; se puede vincular o crear igualmente. */
export class PossibleDuplicate extends Error implements HasErrorDetails {
  constructor(readonly candidates: StudentCandidate[]) {
    super(
      `Posible duplicado: ya existe «${
        candidates[0]?.fullName ?? ''
      }». Vincula la fila a ese alumno o confirma que es otra persona.`,
    );
    this.name = 'PossibleDuplicate';
  }

  details(): Record<string, string> {
    return { candidates: this.candidates.map((c) => c.id).join(', ') };
  }
}

/** Lo que administración decide para una fila: vincular a un alumno, crear uno (con los datos revisados) u omitir. */
export interface ImportDecision {
  line: number;
  action: string;
  studentId?: string | null;
  groupIds?: string[];
  fullName?: string | null;
  birthDate?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  email?: string | null;
  /** Crear aunque haya un alumno parecido (ya avisado). */
  confirmDuplicate?: boolean;
}

/** Resultado de importar una fila. */
export interface ImportResult {
  line: number;
  action: string;
  studentId: string | null;
  studentName: string;
  payments: number;
  member: boolean;
  entries: number;
}

/**
 * Importa una fila revisada: alta o vínculo del alumno, sus cobros mes a mes, la cuota de socio y los extras.
 * Cada fila es una transacción y una acción del historial propias.
 */
export class ApplyImport {
  /** Día del mes en que se fechan los cobros importados (dentro del plazo del 1 al 5). */
  private static readonly PAYMENT_DAY = 3;

  constructor(
    private readonly parser: SpreadsheetParser,
    private readonly students: StudentMatcher,
    private readonly register: RegisterStudent,
    private readonly importPayment: ImportPayment,
    private readonly accounts: StudentAccountRepository,
    private readonly recordEntry: RecordEntry,
    private readonly transactions: TransactionRunner,
    private readonly clock: Clock,
    private readonly audit: AuditContext,
  ) {}

  /** Importa una sola fila (cada fila es su propia acción: si falla, no afecta a las demás). */
  async execute(text: string, decision: ImportDecision): Promise<ImportResult> {
    const today = LocalDate.fromInstant(this.clock.now());
    const row = this.parser.parse(text, today).find((r) => r.line === decision.line);
    if (!row) throw new InvalidValue('line', `La fila ${decision.line} no está en la hoja.`);
    if (decision.action === 'skip') {
      return {
        line: row.line,
        action: decision.action,
        studentId: null,
        studentName: row.fullName,
        payments: 0,
        member: false,
        entries: 0,
      };
    }
    return await this.transactions.run(async () => {
      const name = decision.fullName ?? row.fullName;
      // La acción del historial nace con el primer cambio: la etiqueta va antes del alta.
      await this.audit.relabel(`Importar fila de la hoja: ${name}`);
      const studentId = await this.student(row, decision, today);
      let payments = 0;
      for (const [month, amount] of Object.entries(row.monthlyCents)) {
        const period = YearMonth.fromString(month);
        const imported = await this.importPayment.execute(
          studentId,
          'monthly',
          period,
          Money.cents(amount),
          ApplyImport.paymentDate(period, today),
        );
        if (imported !== null) payments++;
      }
      const member = row.membershipCents !== null && row.membershipCents > 0;
      if (member) {
        await this.makeMember(studentId);
        const season = Season.containing(ApplyImport.firstMonth(row, today));
        const imported = await this.importPayment.execute(
          studentId,
          'membership',
          season.firstMonth(),
          Money.cents(row.membershipCents ?? 0),
          ApplyImport.paymentDate(season.firstMonth(), today),
        );
        if (imported !== null) payments++;
      }
      let entries = 0;
      const entryDate = ApplyImport.paymentDate(ApplyImport.firstMonth(row, today), today)
        .toString();
      for (
        const [concept, amount] of [['Chándal y polo', row.kitCents], [
          'Licencia federativa',
          row.federationCents,
        ]] as const
      ) {
        if (amount !== null && amount > 0) {
          await this.recordEntry.execute({
            date: entryDate,
            kind: 'income',
            concept: `${concept} · ${name}`,
            category: 'other_income',
            method: 'transfer',
            amount: String(amount / 100),
          });
          entries++;
        }
      }
      return {
        line: row.line,
        action: decision.action,
        studentId,
        studentName: name,
        payments,
        member,
        entries,
      };
    });
  }

  private async student(
    row: ImportedRow,
    decision: ImportDecision,
    today: LocalDate,
  ): Promise<string> {
    if (decision.action === 'link') {
      const id = decision.studentId ?? '';
      if (!(await this.students.exists(id))) {
        throw new InvalidValue(
          'studentId',
          `Fila ${row.line}: el alumno al que vincular no existe.`,
        );
      }
      return id;
    }
    if (decision.action !== 'create') {
      throw new InvalidValue('action', `Fila ${row.line}: decisión desconocida.`);
    }
    const name = decision.fullName ?? row.fullName;
    if (!decision.confirmDuplicate) {
      const exact = await this.students.byName(name);
      const candidates = exact !== null ? [exact] : await this.students.similar(name);
      if (candidates.length > 0) throw new PossibleDuplicate(candidates);
    }
    const guardianName = decision.guardianName ?? row.guardianName;
    const guardianPhone = decision.guardianPhone ?? row.guardianPhone;
    const joined = ApplyImport.paymentDate(ApplyImport.firstMonth(row, today), today);
    return await this.register.execute(
      {
        fullName: name,
        birthDate: decision.birthDate ?? row.birthDate ?? '',
        nationalId: null,
        contactEmail: decision.email ?? row.email,
        guardians: guardianName && guardianPhone
          ? [{ name: guardianName, phone: guardianPhone }]
          : [],
        ownPhone: null,
        federationLicence: null,
        imageConsent: false,
      },
      decision.groupIds ?? [],
      [],
      false,
      `${YearMonth.of(joined).toString()}-01`,
    );
  }

  private async makeMember(studentId: string): Promise<void> {
    const ref = StudentRef.fromString(studentId);
    const account = (await this.accounts.account(ref)) ?? StudentAccount.open(ref);
    if (!account.isMember()) {
      account.update(account.preferredPlan(), true, account.privateRate());
      await this.accounts.saveAccount(account);
    }
  }

  /** Primer mes con cobro en la hoja, o el inicio de la temporada en curso. */
  private static firstMonth(row: ImportedRow, today: LocalDate): YearMonth {
    const months = Object.keys(row.monthlyCents).sort();
    return months[0]
      ? YearMonth.fromString(months[0])
      : Season.containing(YearMonth.of(today)).firstMonth();
  }

  /** El día 3 de ese mes, o hoy si ese mes todavía no ha llegado. */
  private static paymentDate(month: YearMonth, today: LocalDate): LocalDate {
    const date = LocalDate.fromString(
      `${month.toString()}-${String(ApplyImport.PAYMENT_DAY).padStart(2, '0')}`,
    );
    return today.isBefore(date) ? today : date;
  }
}
