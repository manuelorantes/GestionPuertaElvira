import { type Clock, InvalidValue, LocalDate, type YearMonth } from '../../domain/common/mod.ts';
import {
  monthBalance,
  PointMovement,
  type PointsKind,
  TournamentPhoto,
} from '../../domain/points/mod.ts';

export interface PointMovementRepository {
  /** Todos los movimientos de un alumno (para saldos y comprobaciones). */
  forStudent(student: string): Promise<PointMovement[]>;
  /** El movimiento de ese tipo y referencia de un alumno (p. ej. su asistencia de un viernes), o null. */
  find(student: string, kind: PointsKind, reference: string): Promise<PointMovement | null>;
  add(movement: PointMovement): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface TournamentPhotoRepository {
  find(id: string): Promise<TournamentPhoto | null>;
  save(photo: TournamentPhoto): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Dónde se guardan las imágenes (el almacén de documentos). */
export interface PhotoStorage {
  put(key: string, contents: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
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

export class PhotoNotFound extends Error {
  constructor() {
    super('Esa foto no existe.');
    this.name = 'PhotoNotFound';
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

export interface PhotoUpload {
  contents: Uint8Array;
  mimeType: string;
}

/** Adjunta la foto de un alumno con la equipación oficial en un torneo: le da sus puntos en el mes de la foto. */
export class AddTournamentPhoto {
  constructor(
    private readonly photos: TournamentPhotoRepository,
    private readonly movements: PointMovementRepository,
    private readonly students: PointsStudents,
    private readonly storage: PhotoStorage,
    private readonly clock: Clock,
  ) {}

  async execute(
    student: string,
    date: string,
    note: string | null,
    upload: PhotoUpload,
    by: string | null,
  ): Promise<string> {
    const day = LocalDate.fromString(date);
    const photo = TournamentPhoto.take(
      student,
      day,
      note,
      upload.mimeType,
      upload.contents.length,
      LocalDate.fromInstant(this.clock.now()),
    );
    await ensureActive(this.students, student, day);
    await this.storage.put(photo.documentKey, upload.contents);
    await this.photos.save(photo);
    await this.movements.add(photo.movement(by));
    return photo.id;
  }
}

/** Quita una foto y sus puntos (si no se han gastado ya ese mes). */
export class DeleteTournamentPhoto {
  constructor(
    private readonly photos: TournamentPhotoRepository,
    private readonly movements: PointMovementRepository,
    private readonly storage: PhotoStorage,
  ) {}

  async execute(id: string): Promise<void> {
    const photo = await this.photos.find(id);
    if (photo === null) throw new PhotoNotFound();
    const movement = await this.movements.find(photo.student, 'tournament', photo.id);
    if (movement !== null) await removeMovement(this.movements, movement);
    await this.photos.delete(id);
    await this.storage.remove(photo.documentKey);
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
  /** Qué es: «Viernes 04/09», la foto de torneo, el motivo del ajuste o el recibo del canje. */
  concept: string;
  by: string | null;
}

export interface FridayGrid {
  fridays: { date: string; holiday: string | null }[];
  students: { id: string; name: string; memberNumber: number | null; present: string[] }[];
}

/** Una foto de la galería de un mes. */
export interface PhotoView {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  note: string | null;
  points: number;
}

export interface PointsQuery {
  students(month: YearMonth, from: LocalDate, to: LocalDate): Promise<StudentPointsView[]>;
  movements(
    from: LocalDate,
    to: LocalDate,
    filter: { kind: PointsKind | null; student: string | null },
  ): Promise<PointMovementView[]>;
  fridays(month: YearMonth, fridays: LocalDate[]): Promise<FridayGrid>;
  photos(from: LocalDate, to: LocalDate): Promise<PhotoView[]>;
}

/** Los viernes de un mes. */
export function fridaysOf(month: YearMonth): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = month.firstDay(); !month.lastDay().isBefore(day); day = day.plusDays(1)) {
    if (day.isoWeekday() === 5) days.push(day);
  }
  return days;
}
