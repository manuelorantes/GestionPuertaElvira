import {
  CertificateSettings,
  CertificateSigner,
  type EnrolmentCertificate,
} from '../../domain/students/mod.ts';
import type {
  CertificateQuery,
  CertificateRepository,
  CertificateSettingsRepository,
  CertificateView,
  ClubLetterhead,
} from '../../application/students/certificates.ts';
import { SqlBillingSettingsRepository } from './billing.ts';
import { Row, type Sql } from './sql.ts';

/** Certificados de matrícula emitidos (tabla `students_certificate`). */
export class SqlCertificateRepository implements CertificateRepository {
  constructor(private readonly sql: Sql) {}

  async save(c: EnrolmentCertificate): Promise<void> {
    await this.sql`INSERT INTO students_certificate ${
      this.sql({
        id: c.id.value,
        student_id: c.studentId.value,
        student_name: c.studentName,
        national_id: c.nationalId?.value ?? null,
        period_kind: c.period.kind,
        period: c.period.label,
        schedule: c.schedule,
        member_since: c.memberSince.toString(),
        place: c.place,
        issued_on: c.issuedOn.toString(),
        signer_name: c.signer.name,
        signer_role: c.signer.role,
        signed: c.signed,
        issued_by: c.issuedBy,
      })
    }`;
  }
}

type StoredCertificate = Omit<CertificateView, 'club'>;

const COLUMNS =
  `c.id::text AS id, c.student_name, c.national_id, c.period_kind, c.period, c.schedule,
  c.member_since::text AS member_since, c.place, c.issued_on::text AS issued_on, c.signer_name, c.signer_role,
  c.signed, c.created_at, u.full_name AS issued_by_name`;

export class SqlCertificateQuery implements CertificateQuery {
  constructor(private readonly sql: Sql) {}

  async forStudent(studentId: string): Promise<StoredCertificate[]> {
    const rows = await this.sql`SELECT ${this.sql.unsafe(COLUMNS)}
        FROM students_certificate c LEFT JOIN identity_user u ON u.id = c.issued_by
       WHERE c.student_id::text = ${studentId}
       ORDER BY c.created_at DESC, c.id DESC`;
    return Row.all(rows).map(toView);
  }

  async find(studentId: string, id: string): Promise<StoredCertificate | null> {
    const rows = await this.sql`SELECT ${this.sql.unsafe(COLUMNS)}
        FROM students_certificate c LEFT JOIN identity_user u ON u.id = c.issued_by
       WHERE c.student_id::text = ${studentId} AND c.id::text = ${id}`;
    return rows[0] ? toView(new Row(rows[0])) : null;
  }
}

function toView(row: Row): StoredCertificate {
  return {
    id: row.string('id'),
    studentName: row.string('student_name'),
    nationalId: row.nullableString('national_id'),
    periodKind: row.string('period_kind') === 'year' ? 'year' : 'season',
    period: row.string('period'),
    schedule: row.string('schedule'),
    memberSince: row.string('member_since'),
    place: row.string('place'),
    issuedOn: row.string('issued_on'),
    signer: { name: row.string('signer_name'), role: row.string('signer_role') },
    signed: row.bool('signed'),
    issuedByName: row.nullableString('issued_by_name'),
    createdAt: row.date('created_at').toISOString(),
  };
}

/** Firmante por defecto y firma escaneada (tabla de una fila `students_certificate_settings`). */
export class SqlCertificateSettingsRepository implements CertificateSettingsRepository {
  constructor(private readonly sql: Sql) {}

  async get(): Promise<CertificateSettings> {
    const rows = await this.sql`SELECT * FROM students_certificate_settings WHERE id = 1`;
    if (!rows[0]) return CertificateSettings.defaults();
    const row = new Row(rows[0]);
    const key = row.nullableString('signature_key');
    const mimeType = row.nullableString('signature_mime_type');
    return new CertificateSettings(
      new CertificateSigner(row.string('signer_name'), row.string('signer_role')),
      key === null || mimeType === null ? null : { key, mimeType },
    );
  }

  async save(s: CertificateSettings): Promise<void> {
    const values = {
      id: 1,
      signer_name: s.signer.name,
      signer_role: s.signer.role,
      signature_key: s.signature?.key ?? null,
      signature_mime_type: s.signature?.mimeType ?? null,
    };
    await this.sql`INSERT INTO students_certificate_settings ${this.sql(values)}
      ON CONFLICT (id) DO UPDATE SET signer_name = EXCLUDED.signer_name,
        signer_role = EXCLUDED.signer_role, signature_key = EXCLUDED.signature_key,
        signature_mime_type = EXCLUDED.signature_mime_type`;
  }
}

/** El membrete sale de los datos fiscales del club que se editan en Cobros. */
export class SqlClubLetterhead implements ClubLetterhead {
  constructor(private readonly sql: Sql) {}

  async get(): Promise<{ name: string; taxId: string; address: string }> {
    const { club } = await new SqlBillingSettingsRepository(this.sql).get();
    return { name: club.name, taxId: club.taxId, address: club.address };
  }
}
