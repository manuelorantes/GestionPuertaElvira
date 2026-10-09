import {
  type Clock,
  generateUuidV7,
  InvalidValue,
  LocalDate,
  type YearMonth,
} from '../../domain/common/mod.ts';
import {
  monthBalance,
  PointMovement,
  type PointsKind,
  Tournament,
} from '../../domain/points/mod.ts';

export interface PointMovementRepository {
  /** Todos los movimientos de un alumno (para saldos y comprobaciones). */
  forStudent(student: string): Promise<PointMovement[]>;
  /** El movimiento de ese tipo y referencia de un alumno (p. ej. su asistencia de un viernes), o null. */
  find(student: string, kind: PointsKind, reference: string): Promise<PointMovement | null>;
  add(movement: PointMovement): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface TournamentRepository {
  find(id: string): Promise<Tournament | null>;
  save(tournament: Tournament): Promise<void>;
  delete(id: string): Promise<void>;
  /** Cuántos alumnos mandaron foto. */
  photos(id: string): Promise<number>;
}

/** Alumnos activos (los únicos que ganan puntos). */
export interface PointsStudents {
  isActive(student: string, on: LocalDate): Promise<boolean>;
}

export class PointsStudentNotFound extends Error {
  constructor() {
    super('Ese alumno no existe o está de baja.');
    this.name = 'PointsStudentNotFound';
  }
}

export class TournamentNotFound extends Error {
  constructor() {
    super('Ese torneo no existe.');
    this.name = 'TournamentNotFound';
  }
}

export class TournamentHasPhotos extends Error {
  constructor() {
    super('No se puede borrar un torneo con fotos marcadas: quítalas antes.');
    this.name = 'TournamentHasPhotos';
  }
}

async function ensureActive(
  students: PointsStudents,
  student: string,
  on: LocalDate,
): Promise<void> {
  if (!(await students.isActive(student, on))) throw new PointsStudentNotFound();
}

/** Quita un movimiento si no deja su mes en negativo. */
async function removeMovement(
  movements: PointMovementRepository,
  movement: PointMovement,
): Promise<void> {
  const others = (await movements.forStudent(movement.student)).filter((m) => m.id !== movement.id);
  PointMovement.assertCanApply([...others, movement], movement.reversed());
  await movements.remove(movement.id);
}

/** Marca (o desmarca) que un alumno vino un viernes: cada viernes es un punto de ese mes. No se marcan viernes futuros. */
export class MarkFriday {
  constructor(
    private readonly movements: PointMovementRepository,
    private readonly students: PointsStudents,
    private readonly clock: Clock,
  ) {}

  async execute(student: string, date: string, present: boolean, by: string | null): Promise<void> {
    const day = LocalDate.fromString(date);
    if (LocalDate.fromInstant(this.clock.now()).isBefore(day)) {
      throw new InvalidValue('date', 'No se puede marcar un viernes que aún no ha llegado.');
    }
    const existing = await this.movements.find(student, 'friday', day.toString());
    if (present) {
      if (existing !== null) return;
      const movement = PointMovement.friday(student, day, by);
      await ensureActive(this.students, student, day);
      await this.movements.add(movement);
    } else if (existing !== null) {
      await removeMovement(this.movements, existing);
    }
  }
}

/** Suma o resta puntos a mano con un motivo; cuentan en el mes de hoy. */
export class AdjustPointsByHand {
  constructor(
    private readonly movements: PointMovementRepository,
    private readonly students: PointsStudents,
    private readonly clock: Clock,
  ) {}

  async execute(student: string, delta: number, note: string, by: string | null): Promise<void> {
    const today = LocalDate.fromInstant(this.clock.now());
    await ensureActive(this.students, student, today);
    const movement = PointMovement.manual(student, today, delta, note, by);
    PointMovement.assertCanApply(await this.movements.forStudent(student), movement);
    await this.movements.add(movement);
  }
}

export interface TournamentInput {
  name: string;
  date: string;
  pointsPerPhoto: number;
}

/** Crea o cambia un torneo (cambiar su fecha o sus puntos no cambia las fotos ya marcadas). */
export class SaveTournament {
  constructor(private readonly tournaments: TournamentRepository) {}

  async execute(id: string | null, input: TournamentInput): Promise<string> {
    const date = LocalDate.fromString(input.date);
    if (id === null) {
      const created = Tournament.create(generateUuidV7(), input.name, date, input.pointsPerPhoto);
      await this.tournaments.save(created);
      return created.id;
    }
    const tournament = await this.tournaments.find(id);
    if (tournament === null) throw new TournamentNotFound();
    tournament.update(input.name, date, input.pointsPerPhoto);
    await this.tournaments.save(tournament);
    return id;
  }
}

export class DeleteTournament {
  constructor(private readonly tournaments: TournamentRepository) {}

  async execute(id: string): Promise<void> {
    if ((await this.tournaments.find(id)) === null) throw new TournamentNotFound();
    if ((await this.tournaments.photos(id)) > 0) throw new TournamentHasPhotos();
    await this.tournaments.delete(id);
  }
}

/** Marca (o desmarca) que un alumno mandó su foto con la equipación oficial en un torneo. */
export class MarkTournamentPhoto {
  constructor(
    private readonly tournaments: TournamentRepository,
    private readonly movements: PointMovementRepository,
    private readonly students: PointsStudents,
  ) {}

  async execute(
    tournamentId: string,
    student: string,
    sent: boolean,
    by: string | null,
  ): Promise<void> {
    const tournament = await this.tournaments.find(tournamentId);
    if (tournament === null) throw new TournamentNotFound();
    const existing = await this.movements.find(student, 'tournament', tournamentId);
    if (sent) {
      if (existing !== null) return;
      await ensureActive(this.students, student, tournament.date);
      await this.movements.add(tournament.photo(student, by));
    } else if (existing !== null) {
      await removeMovement(this.movements, existing);
    }
  }
}

/** Los puntos que un alumno puede gastar en un mes (y canjearlos en un cobro). */
export class PointsWalletService {
  constructor(private readonly movements: PointMovementRepository) {}

  async available(student: string, month: YearMonth): Promise<number> {
    return monthBalance(await this.movements.forStudent(student), month.firstDay());
  }

  /** Gasta puntos en un cobro (el canje del 5 % de una cuota): cuentan en el mes del cobro. */
  async redeem(
    student: string,
    date: LocalDate,
    points: number,
    payment: string,
    note: string,
  ): Promise<void> {
    const movement = PointMovement.redemption(student, date, points, payment, note);
    PointMovement.assertCanApply(await this.movements.forStudent(student), movement);
    await this.movements.add(movement);
  }
}

// ---- Lecturas ---------------------------------------------------------------------------------

export interface StudentPointsView {
  id: string;
  name: string;
  memberNumber: number | null;
  /** Saldo del mes consultado (lo ganado menos lo gastado ese mes). */
  points: number;
  /** Ganados y canjeados en la temporada del mes consultado. */
  seasonEarned: number;
  seasonRedeemed: number;
}

export interface PointMovementView {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  delta: number;
  kind: PointsKind;
  /** Qué es: «Viernes 04/09», el torneo, el motivo del ajuste o el recibo del canje. */
  concept: string;
  by: string | null;
}

export interface FridayGrid {
  fridays: { date: string; holiday: string | null }[];
  students: { id: string; name: string; memberNumber: number | null; present: string[] }[];
}

export interface TournamentView {
  id: string;
  name: string;
  date: string;
  pointsPerPhoto: number;
  photos: number;
}

export interface TournamentDetailView extends TournamentView {
  students: { id: string; name: string; memberNumber: number | null; sent: boolean }[];
}

export interface PointsQuery {
  students(month: YearMonth, from: LocalDate, to: LocalDate): Promise<StudentPointsView[]>;
  movements(
    from: LocalDate,
    to: LocalDate,
    filter: { kind: PointsKind | null; student: string | null },
  ): Promise<PointMovementView[]>;
  fridays(month: YearMonth, fridays: LocalDate[]): Promise<FridayGrid>;
  tournaments(from: LocalDate, to: LocalDate): Promise<TournamentView[]>;
  tournament(id: string): Promise<TournamentDetailView | null>;
}

/** Los viernes de un mes. */
export function fridaysOf(month: YearMonth): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = month.firstDay(); !month.lastDay().isBefore(day); day = day.plusDays(1)) {
    if (day.isoWeekday() === 5) days.push(day);
  }
  return days;
}
