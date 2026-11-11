import { InvalidValue, LocalDate, Season, Uuid, YearMonth } from '../common/mod.ts';
import type { NationalId, StudentId } from './mod.ts';

export class CertificateId extends Uuid {}

function requiredText(field: string, value: string, max: number, message: string): string {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text === '' || [...text].length > max) throw new InvalidValue(field, message);
  return text;
}

/** Quien firma un certificado: nombre y cargo en el club. */
export class CertificateSigner {
  readonly name: string;
  readonly role: string;

  constructor(name: string, role: string) {
    this.name = requiredText('signerName', name, 120, 'Escribe quién firma el certificado.');
    this.role = requiredText('signerRole', role, 80, 'Escribe el cargo de quien firma.');
  }

  /** La misma persona con el mismo cargo, sin mirar espacios ni mayúsculas. */
  equals(other: CertificateSigner): boolean {
    return this.isNamed(other.name) && this.role.toLowerCase() === other.role.toLowerCase();
  }

  isNamed(name: string): boolean {
    return this.name.toLowerCase() === name.replace(/\s+/gu, ' ').trim().toLowerCase();
  }
}

/**
 * Firmante por defecto de los certificados y, si se ha subido, su firma escaneada (en el almacén de documentos). La
 * firma es de esa persona: al cambiar de firmante se deja de usar.
 */
export class CertificateSettings {
  constructor(
    readonly signer: CertificateSigner,
    readonly signature: { key: string; mimeType: string } | null,
  ) {}

  /** El presidente del club, sin firma subida (la migración crea los mismos ajustes). */
  static defaults(): CertificateSettings {
    return new CertificateSettings(
      new CertificateSigner('Manuel Orantes Taboada', 'Presidente'),
      null,
    );
  }

  static readonly SIGNATURE_TYPES: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
  };
  static readonly MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

  withSigner(signer: CertificateSigner): CertificateSettings {
    return new CertificateSettings(
      signer,
      this.signer.isNamed(signer.name) ? this.signature : null,
    );
  }

  /** La nueva firma: PNG o JPEG de hasta 2 MB, guardada con una clave nueva. */
  withSignature(mimeType: string, size: number): CertificateSettings {
    const extension = CertificateSettings.SIGNATURE_TYPES[mimeType];
    if (extension === undefined) {
      throw new InvalidValue('file', 'La firma tiene que ser una imagen PNG o JPEG.');
    }
    if (size === 0 || size > CertificateSettings.MAX_SIGNATURE_BYTES) {
      throw new InvalidValue('file', 'La firma no puede pasar de 2 MB.');
    }
    return new CertificateSettings(this.signer, {
      key: `signatures/${CertificateId.generate().value}.${extension}`,
      mimeType,
    });
  }

  withoutSignature(): CertificateSettings {
    return new CertificateSettings(this.signer, null);
  }
}

/** Una clase del alumno a efectos del certificado: días (`mon`…`fri`) y horas. */
export interface ScheduleSlot {
  days: readonly string[];
  start: string;
  end: string;
}

const DAY_NAMES: Record<string, string> = {
  mon: 'lunes',
  tue: 'martes',
  wed: 'miércoles',
  thu: 'jueves',
  fri: 'viernes',
};

function joinWithAnd(parts: readonly string[]): string {
  return parts.length <= 1
    ? parts[0] ?? ''
    : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** «los lunes y miércoles de 17:00 a 18:00 horas y los viernes de 17:00 a 18:30 horas». */
export function classSchedulePhrase(slots: readonly ScheduleSlot[]): string {
  return joinWithAnd(
    slots.map((slot) =>
      `los ${
        joinWithAnd(slot.days.map((d) => DAY_NAMES[d] ?? d))
      } de ${slot.start} a ${slot.end} horas`
    ),
  );
}

/** Curso con los dos años completos («2026/2027»), el de ese día (julio y agosto, el que empieza). */
export function seasonFullLabel(day: LocalDate): string {
  const start = Season.containing(YearMonth.of(day)).firstMonth().year;
  return `${start}/${start + 1}`;
}

export type CertificatePeriodKind = 'season' | 'year';

/** Lo que certifica: un curso («2026/2027», los dos años completos) o un año natural («2026»). */
export class CertificatePeriod {
  private constructor(readonly kind: CertificatePeriodKind, readonly label: string) {}

  static of(kind: string, label: string): CertificatePeriod {
    const text = label.trim();
    if (kind === 'season') {
      const season = /^(\d{4})\/(\d{4})$/.exec(text);
      if (season === null || Number(season[2]) !== Number(season[1]) + 1) {
        throw new InvalidValue('period', 'El curso se escribe como 2026/2027.');
      }
      return new CertificatePeriod('season', text);
    }
    if (kind === 'year') {
      if (!/^(19|20)\d{2}$/.test(text)) {
        throw new InvalidValue('period', 'El año se escribe con sus cuatro cifras, como 2026.');
      }
      return new CertificatePeriod('year', text);
    }
    throw new InvalidValue('periodKind', 'Elige si certifica un curso o un año.');
  }

  /** Su último día: el 30 de junio para un curso (julio y agosto son ya del siguiente), el 31 de diciembre para un año. */
  lastDay(): LocalDate {
    const year = Number(this.label.slice(0, 4));
    return this.kind === 'season'
      ? Season.startingIn(year).lastMonth().lastDay()
      : LocalDate.fromString(`${this.label}-12-31`);
  }
}

export interface CertificateRequest {
  studentId: StudentId;
  studentName: string;
  /** Sin DNI ni NIE, el certificado no lo menciona. */
  nationalId: NationalId | null;
  period: CertificatePeriod;
  schedule: string;
  memberSince: LocalDate;
  place: string;
  issuedOn: LocalDate;
  signer: CertificateSigner;
  /** Con la firma escaneada; si no, se firma a mano. */
  signed: boolean;
  defaultSigner: CertificateSigner;
  signatureAvailable: boolean;
  issuedBy: string | null;
}

/**
 * Certificado de matrícula de un alumno, tal como se emitió: guarda lo certificado (nombre, DNI, curso o año, horario…) para
 * poder volver a imprimirlo igual aunque luego cambie su ficha.
 */
export class EnrolmentCertificate {
  private constructor(
    readonly id: CertificateId,
    readonly studentId: StudentId,
    readonly studentName: string,
    readonly nationalId: NationalId | null,
    readonly period: CertificatePeriod,
    readonly schedule: string,
    readonly memberSince: LocalDate,
    readonly place: string,
    readonly issuedOn: LocalDate,
    readonly signer: CertificateSigner,
    readonly signed: boolean,
    readonly issuedBy: string | null,
  ) {}

  static issue(request: CertificateRequest): EnrolmentCertificate {
    if (request.issuedOn.isBefore(request.memberSince)) {
      throw new InvalidValue(
        'memberSince',
        'La fecha desde la que pertenece al club no puede ser posterior a la del certificado.',
      );
    }
    if (request.period.lastDay().isBefore(request.memberSince)) {
      throw new InvalidValue(
        'memberSince',
        `Pertenece al club desde después ${
          request.period.kind === 'season' ? 'del curso' : 'del año'
        } que certifica: cambia la fecha de alta o el ${
          request.period.kind === 'season' ? 'curso' : 'año'
        }.`,
      );
    }
    if (
      request.signed &&
      (!request.signatureAvailable || !request.signer.equals(request.defaultSigner))
    ) {
      throw new InvalidValue('signed', 'La firma escaneada solo es la del firmante por defecto.');
    }
    return new EnrolmentCertificate(
      CertificateId.generate(),
      request.studentId,
      request.studentName,
      request.nationalId,
      request.period,
      requiredText('schedule', request.schedule, 300, 'Escribe el horario de clase.'),
      request.memberSince,
      requiredText('place', request.place, 80, 'Escribe el lugar del certificado.'),
      request.issuedOn,
      request.signer,
      request.signed,
      request.issuedBy,
    );
  }

  static restore(
    id: CertificateId,
    studentId: StudentId,
    studentName: string,
    nationalId: NationalId | null,
    period: CertificatePeriod,
    schedule: string,
    memberSince: LocalDate,
    place: string,
    issuedOn: LocalDate,
    signer: CertificateSigner,
    signed: boolean,
    issuedBy: string | null,
  ): EnrolmentCertificate {
    return new EnrolmentCertificate(
      id,
      studentId,
      studentName,
      nationalId,
      period,
      schedule,
      memberSince,
      place,
      issuedOn,
      signer,
      signed,
      issuedBy,
    );
  }
}
