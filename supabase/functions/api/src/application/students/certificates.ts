import { type Clock, InvalidValue, LocalDate } from '../../domain/common/mod.ts';
import {
  type CertificateId,
  CertificateSettings,
  CertificateSigner,
  classSchedulePhrase,
  EnrolmentCertificate,
  NationalId,
  seasonFullLabel,
  StudentId,
} from '../../domain/students/mod.ts';
import { StudentNotFound, type StudentQuery, type StudentRepository } from './mod.ts';

export interface CertificateRepository {
  save(certificate: EnrolmentCertificate): Promise<void>;
}

export interface CertificateSettingsRepository {
  get(): Promise<CertificateSettings>;
  save(settings: CertificateSettings): Promise<void>;
}

/** Donde se guarda la firma escaneada (el almacén de documentos, privado). */
export interface SignatureStorage {
  put(key: string, contents: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

/** Nombre, NIF y dirección del club para el membrete (los datos fiscales de Cobros). */
export interface ClubLetterhead {
  get(): Promise<{ name: string; taxId: string; address: string }>;
}

/** Un certificado emitido, listo para imprimir. */
export interface CertificateView {
  id: string;
  studentName: string;
  nationalId: string;
  season: string;
  schedule: string;
  memberSince: string;
  place: string;
  issuedOn: string;
  signer: { name: string; role: string };
  signed: boolean;
  issuedByName: string | null;
  createdAt: string;
  club: { name: string; taxId: string; address: string };
}

export interface CertificateQuery {
  /** Del último emitido al primero. */
  forStudent(studentId: string): Promise<Omit<CertificateView, 'club'>[]>;
  find(studentId: string, id: string): Promise<Omit<CertificateView, 'club'> | null>;
}

export class CertificateNotFound extends Error {
  constructor() {
    super('No existe ese certificado.');
    this.name = 'CertificateNotFound';
  }
}

export class SignatureNotFound extends Error {
  constructor() {
    super('No se ha subido la firma escaneada.');
    this.name = 'SignatureNotFound';
  }
}

/** El lugar de expedición que se propone: la ciudad del club. */
const DEFAULT_PLACE = 'Granada';

export interface CertificateDraft {
  studentName: string;
  nationalId: string | null;
  memberSince: string;
  season: string;
  schedule: string;
  place: string;
  issuedOn: string;
  signer: { name: string; role: string };
  signatureAvailable: boolean;
}

/** Lo que se propone para el certificado de un alumno: sus datos, el curso y su horario de hoy, y el firmante por defecto. */
export class DraftCertificate {
  constructor(
    private readonly students: StudentQuery,
    private readonly settings: CertificateSettingsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(studentId: string): Promise<CertificateDraft> {
    const today = LocalDate.fromInstant(this.clock.now());
    const student = await this.students.detail(studentId, today);
    if (student === null) throw new StudentNotFound();
    const settings = await this.settings.get();
    return {
      studentName: student.fullName,
      nationalId: student.nationalId,
      memberSince: student.joinedOn,
      season: seasonFullLabel(today),
      schedule: classSchedulePhrase(student.groups.map((g) => g.schedule)),
      place: DEFAULT_PLACE,
      issuedOn: today.toString(),
      signer: { name: settings.signer.name, role: settings.signer.role },
      signatureAvailable: settings.signature !== null,
    };
  }
}

export interface CertificateInput {
  /** Su DNI o NIE si no consta en la ficha (o para corregirlo): se guarda también en ella. */
  nationalId: string | null;
  season: string;
  schedule: string;
  place: string;
  issuedOn: string;
  signerName: string;
  signerRole: string;
  signed: boolean;
}

/** Emite un certificado de matrícula y lo deja registrado. Sin DNI o NIE no se puede. */
export class IssueCertificate {
  constructor(
    private readonly students: StudentRepository,
    private readonly certificates: CertificateRepository,
    private readonly settings: CertificateSettingsRepository,
  ) {}

  async execute(
    studentId: string,
    input: CertificateInput,
    by: string | null,
  ): Promise<CertificateId> {
    const student = await this.students.find(StudentId.fromString(studentId));
    if (student === null) throw new StudentNotFound();
    if (input.nationalId !== null && input.nationalId.trim() !== '') {
      const nationalId = NationalId.fromString(input.nationalId);
      if (student.details().nationalId?.value !== nationalId.value) {
        student.changeNationalId(nationalId);
        await this.students.save(student);
      }
    }
    const nationalId = student.details().nationalId;
    if (nationalId === null) {
      throw new InvalidValue('nationalId', 'Escribe el DNI o NIE del alumno.');
    }
    const settings = await this.settings.get();
    const certificate = EnrolmentCertificate.issue({
      studentId: student.id,
      studentName: student.details().fullName.value,
      nationalId,
      season: input.season,
      schedule: input.schedule,
      memberSince: student.joinedOn,
      place: input.place,
      issuedOn: LocalDate.fromString(input.issuedOn),
      signer: new CertificateSigner(input.signerName, input.signerRole),
      signed: input.signed,
      defaultSigner: settings.signer,
      signatureAvailable: settings.signature !== null,
      issuedBy: by,
    });
    await this.certificates.save(certificate);
    return certificate.id;
  }
}

/** Cambia el firmante por defecto; si es otra persona, su firma escaneada deja de usarse. */
export class UpdateCertificateSettings {
  constructor(
    private readonly settings: CertificateSettingsRepository,
    private readonly storage: SignatureStorage,
  ) {}

  async execute(signerName: string, signerRole: string): Promise<void> {
    const current = await this.settings.get();
    const next = current.withSigner(new CertificateSigner(signerName, signerRole));
    await this.settings.save(next);
    if (current.signature !== null && next.signature === null) {
      await this.storage.remove(current.signature.key);
    }
  }
}

/** Sube (o cambia) la firma escaneada del firmante por defecto. */
export class UploadSignature {
  constructor(
    private readonly settings: CertificateSettingsRepository,
    private readonly storage: SignatureStorage,
  ) {}

  async execute(contents: Uint8Array, mimeType: string): Promise<void> {
    const current = await this.settings.get();
    const next = current.withSignature(mimeType, contents.length);
    if (next.signature === null) return;
    await this.storage.put(next.signature.key, contents);
    await this.settings.save(next);
    if (current.signature !== null) await this.storage.remove(current.signature.key);
  }
}

/** Quita la firma escaneada: los certificados se firmarán a mano. */
export class RemoveSignature {
  constructor(
    private readonly settings: CertificateSettingsRepository,
    private readonly storage: SignatureStorage,
  ) {}

  async execute(): Promise<void> {
    const current = await this.settings.get();
    if (current.signature === null) return;
    await this.settings.save(current.withoutSignature());
    await this.storage.remove(current.signature.key);
  }
}

/** La firma escaneada, para ponerla en el certificado. */
export class ReadSignature {
  constructor(
    private readonly settings: CertificateSettingsRepository,
    private readonly storage: SignatureStorage,
  ) {}

  async execute(): Promise<{ contents: Uint8Array; mimeType: string }> {
    const { signature } = await this.settings.get();
    if (signature === null) throw new SignatureNotFound();
    return { contents: await this.storage.read(signature.key), mimeType: signature.mimeType };
  }
}
