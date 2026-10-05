import { InvalidValue } from './errors.ts';

const TIMEZONE = 'Europe/Madrid';
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Fecha de calendario sin hora (zona del club: Europe/Madrid).
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static fromString(iso: string): LocalDate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) throw new InvalidValue('date', 'La fecha no es válida.');
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new InvalidValue('date', 'La fecha no es válida.');
    }
    return new LocalDate(year, month, day);
  }

  /** Día de calendario de un instante, visto desde Madrid. */
  static fromInstant(instant: Date): LocalDate {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    return LocalDate.fromString(parts);
  }

  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-${
      String(this.day).padStart(2, '0')
    }`;
  }

  private ordinal(): number {
    return Date.UTC(this.year, this.month - 1, this.day);
  }

  isBefore(other: LocalDate): boolean {
    return this.ordinal() < other.ordinal();
  }

  isAfterOrEqual(other: LocalDate): boolean {
    return !this.isBefore(other);
  }

  equals(other: LocalDate): boolean {
    return this.toString() === other.toString();
  }

  /** Años cumplidos en `day`, contando el cumpleaños exacto. */
  ageOn(day: LocalDate): number {
    let age = day.year - this.year;
    if (day.month < this.month || (day.month === this.month && day.day < this.day)) age--;
    return age;
  }

  plusDays(days: number): LocalDate {
    const moved = new Date(this.ordinal() + days * 86_400_000);
    return new LocalDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
  }

  /** Día de la semana ISO: 1 lunes … 7 domingo. */
  isoWeekday(): number {
    const day = new Date(this.ordinal()).getUTCDay();
    return day === 0 ? 7 : day;
  }
}

export class YearMonth {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {}

  static fromString(value: string): YearMonth {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    const month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12) {
      throw new InvalidValue('month', 'El mes debe tener el formato AAAA-MM.');
    }
    return new YearMonth(Number(match[1]), month);
  }

  static of(date: LocalDate): YearMonth {
    return new YearMonth(date.year, date.month);
  }

  next(): YearMonth {
    return this.month === 12
      ? new YearMonth(this.year + 1, 1)
      : new YearMonth(this.year, this.month + 1);
  }

  previous(): YearMonth {
    return this.month === 1
      ? new YearMonth(this.year - 1, 12)
      : new YearMonth(this.year, this.month - 1);
  }

  isBefore(other: YearMonth): boolean {
    return this.year < other.year || (this.year === other.year && this.month < other.month);
  }

  equals(other: YearMonth): boolean {
    return this.year === other.year && this.month === other.month;
  }

  days(): number {
    return new Date(Date.UTC(this.year, this.month, 0)).getUTCDate();
  }

  firstDay(): LocalDate {
    return LocalDate.fromString(`${this.toString()}-01`);
  }

  lastDay(): LocalDate {
    return LocalDate.fromString(`${this.toString()}-${String(this.days()).padStart(2, '0')}`);
  }

  label(): string {
    return `${MONTHS[this.month - 1]} ${this.year}`;
  }

  shortLabel(): string {
    const name = MONTHS[this.month - 1] ?? '';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}`;
  }
}

/**
 * Temporada del club: de septiembre a junio. Julio y agosto no tienen clases.
 */
export class Season {
  private constructor(readonly startYear: number) {}

  /** Temporada a la que pertenece un mes; julio y agosto cuentan para la que empieza en septiembre. */
  static containing(month: YearMonth): Season {
    return new Season(month.month >= 7 ? month.year : month.year - 1);
  }

  /** Temporada con clases en ese mes, o null en julio y agosto. */
  static teachingSeason(month: YearMonth): Season | null {
    return month.month === 7 || month.month === 8 ? null : Season.containing(month);
  }

  static startingIn(year: number): Season {
    return new Season(year);
  }

  firstMonth(): YearMonth {
    return YearMonth.fromString(`${String(this.startYear).padStart(4, '0')}-09`);
  }

  lastMonth(): YearMonth {
    return YearMonth.fromString(`${String(this.startYear + 1).padStart(4, '0')}-06`);
  }

  includes(month: YearMonth): boolean {
    return !month.isBefore(this.firstMonth()) && !this.lastMonth().isBefore(month);
  }

  /** Meses de clase desde `month` (incluido) hasta junio. */
  monthsFrom(month: YearMonth): number {
    let count = 0;
    for (let current = month; !this.lastMonth().isBefore(current); current = current.next()) {
      count++;
    }
    return count;
  }

  label(): string {
    return `${this.startYear}/${String((this.startYear + 1) % 100).padStart(2, '0')}`;
  }
}
