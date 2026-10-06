import {
  type EmailAddress,
  type FullName,
  InvalidValue,
  type LocalDate,
  type PhoneNumber,
  Uuid,
} from '../common/mod.ts';

export class StudentId extends Uuid {}

/** DNI o NIE español con letra de control. */
export class NationalId {
  private static readonly LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

  private constructor(readonly value: string) {}

  static fromString(id: string): NationalId {
    const normalised = id.replace(/[\s\-.]/g, '').toUpperCase();
    const match = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(normalised);
    const invalid = new InvalidValue('nationalId', 'El DNI o NIE no es válido.');
    if (!match) throw invalid;
    const [, prefix = '', digits = '', letter = ''] = match;
    if ((prefix === '' && digits.length !== 8) || (prefix !== '' && digits.length !== 7)) {
      throw invalid;
    }
    const number = Number(`${{ X: '0', Y: '1', Z: '2' }[prefix] ?? ''}${digits}`);
    if (NationalId.LETTERS[number % 23] !== letter) throw invalid;
    return new NationalId(normalised);
  }
}

/** Número de licencia federativa; su presencia indica que el alumno está federado. */
export class FederationLicence {
  private constructor(readonly value: string) {}

  static fromString(licence: string): FederationLicence {
    const normalised = licence.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(normalised)) {
      throw new InvalidValue(
        'federationLicence',
        'La licencia federativa debe tener entre 3 y 20 letras, números o guiones.',
      );
    }
    return new FederationLicence(normalised);
  }
}

/** Tutor legal de contacto. */
/** Tutor de un alumno; el teléfono puede faltar (y entonces aparece en Datos pendientes). */
export class Guardian {
  constructor(
    readonly name: FullName,
    readonly phone: PhoneNumber | null,
  ) {}
}

/**
 * Datos que el club espera tener de cada alumno y que pueden faltar. Nada de esto impide el alta:
 * la lista de Datos pendientes los reclama.
 */
export type MissingDatum = 'birth_date' | 'guardian' | 'guardian_phone' | 'phone' | 'email';

/** Datos personales editables de un alumno. Solo el nombre es obligatorio. */
export class StudentDetails {
  private static readonly MAX_GUARDIANS = 2;

  constructor(
    readonly fullName: FullName,
    readonly birthDate: LocalDate | null,
    readonly nationalId: NationalId | null,
    readonly contactEmail: EmailAddress | null,
    readonly guardians: readonly Guardian[],
    readonly ownPhone: PhoneNumber | null,
    readonly federationLicence: FederationLicence | null,
    readonly imageConsent: boolean,
  ) {
    if (guardians.length > StudentDetails.MAX_GUARDIANS) {
      throw new InvalidValue('guardians', 'Un alumno puede tener como mucho dos tutores.');
    }
  }

  /** Edad en ese día, o null si no consta la fecha de nacimiento. */
  ageOn(day: LocalDate): number | null {
    return this.birthDate === null ? null : this.birthDate.ageOn(day);
  }

  /** true/false según la edad; null si no consta la fecha de nacimiento. */
  isMinorOn(day: LocalDate): boolean | null {
    const age = this.ageOn(day);
    return age === null ? null : age < 18;
  }

  /**
   * Qué falta: la fecha de nacimiento; un tutor (y su teléfono) si es menor o no se sabe la edad;
   * el teléfono propio si es adulto; y el email.
   */
  missingData(day: LocalDate): MissingDatum[] {
    const missing: MissingDatum[] = [];
    if (this.birthDate === null) missing.push('birth_date');
    if (this.isMinorOn(day) !== false) {
      if (this.guardians.length === 0) missing.push('guardian');
      else if (this.guardians.every((g) => g.phone === null)) missing.push('guardian_phone');
    } else if (this.ownPhone === null) {
      missing.push('phone');
    }
    if (this.contactEmail === null) missing.push('email');
    return missing;
  }
}

/** La fecha de nacimiento, si consta, tiene que ser creíble. */
export class ContactPolicy {
  private static readonly MAX_AGE = 100;

  assertAcceptable(details: StudentDetails, today: LocalDate): void {
    if (details.birthDate === null) return;
    if (today.isBefore(details.birthDate)) {
      throw new InvalidValue('birthDate', 'La fecha de nacimiento no puede ser futura.');
    }
    if (details.birthDate.ageOn(today) > ContactPolicy.MAX_AGE) {
      throw new InvalidValue('birthDate', 'Revisa la fecha de nacimiento.');
    }
  }
}

/** Alumno del club: datos personales, contacto, hermanos, alta y baja. */
export class Student {
  private constructor(
    readonly id: StudentId,
    private current: StudentDetails,
    readonly joinedOn: LocalDate,
    private withdrawn: LocalDate | null,
    private siblingIds: Map<string, StudentId>,
  ) {}

  static register(
    id: StudentId,
    details: StudentDetails,
    today: LocalDate,
    joinedOn?: LocalDate,
  ): Student {
    new ContactPolicy().assertAcceptable(details, today);
    return new Student(id, details, joinedOn ?? today, null, new Map());
  }

  static restore(
    id: StudentId,
    details: StudentDetails,
    joinedOn: LocalDate,
    withdrawnOn: LocalDate | null,
    siblings: readonly StudentId[],
  ): Student {
    return new Student(
      id,
      details,
      joinedOn,
      withdrawnOn,
      new Map(siblings.map((s) => [s.value, s])),
    );
  }

  updateDetails(details: StudentDetails, today: LocalDate): void {
    new ContactPolicy().assertAcceptable(details, today);
    this.current = details;
  }

  withdraw(on: LocalDate, today: LocalDate): void {
    if (on.isBefore(this.joinedOn)) {
      throw new InvalidValue('date', 'La baja no puede ser anterior al alta en el club.');
    }
    if (on.isBefore(today)) {
      throw new InvalidValue('date', 'La fecha de baja no puede ser anterior a hoy.');
    }
    this.withdrawn = on;
  }

  isActiveOn(day: LocalDate): boolean {
    return this.withdrawn === null || day.isBefore(this.withdrawn);
  }

  addSibling(sibling: StudentId): void {
    if (sibling.equals(this.id)) {
      throw new InvalidValue('siblingId', 'Un alumno no puede ser hermano de sí mismo.');
    }
    this.siblingIds.set(sibling.value, sibling);
  }

  removeSibling(sibling: StudentId): void {
    this.siblingIds.delete(sibling.value);
  }

  details(): StudentDetails {
    return this.current;
  }

  withdrawnOn(): LocalDate | null {
    return this.withdrawn;
  }

  siblings(): StudentId[] {
    return [...this.siblingIds.values()];
  }
}
