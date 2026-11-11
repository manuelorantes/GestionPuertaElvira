import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  CertificatePeriod,
  CertificateSigner,
  classSchedulePhrase,
  EnrolmentCertificate,
  NationalId,
  seasonFullLabel,
  StudentId,
} from '../../src/domain/students/mod.ts';

const STUDENT = StudentId.fromString('0195f1d2-0000-7000-8000-000000000001');
const PRESIDENT = new CertificateSigner('Manuel Orantes Taboada', 'Presidente');

function issue(overrides: Partial<Parameters<typeof EnrolmentCertificate.issue>[0]> = {}) {
  return EnrolmentCertificate.issue({
    studentId: STUDENT,
    studentName: 'Ana Pérez Gil',
    nationalId: NationalId.fromString('12345678Z'),
    period: CertificatePeriod.of('season', '2026/2027'),
    schedule: 'los viernes de 17:00 a 18:30 horas',
    memberSince: LocalDate.fromString('2025-09-15'),
    place: 'Granada',
    issuedOn: LocalDate.fromString('2026-11-11'),
    signer: PRESIDENT,
    signed: false,
    defaultSigner: PRESIDENT,
    signatureAvailable: true,
    issuedBy: null,
    ...overrides,
  });
}

Deno.test('classSchedulePhrase should say the days and hours of each class as in a certificate', () => {
  assertEquals(
    classSchedulePhrase([{ days: ['fri'], start: '17:00', end: '18:30' }]),
    'los viernes de 17:00 a 18:30 horas',
  );
  assertEquals(
    classSchedulePhrase([
      { days: ['mon', 'wed'], start: '17:00', end: '18:00' },
      { days: ['fri'], start: '17:00', end: '18:30' },
    ]),
    'los lunes y miércoles de 17:00 a 18:00 horas y los viernes de 17:00 a 18:30 horas',
  );
  assertEquals(classSchedulePhrase([]), '');
});

Deno.test('seasonFullLabel should name the season with both years in full', () => {
  assertEquals(seasonFullLabel(LocalDate.fromString('2026-11-11')), '2026/2027');
  assertEquals(seasonFullLabel(LocalDate.fromString('2027-03-01')), '2026/2027');
  assertEquals(seasonFullLabel(LocalDate.fromString('2027-07-15')), '2027/2028');
});

Deno.test('EnrolmentCertificate should keep what it certifies, as it was on the day it was issued', () => {
  const certificate = issue({ signed: true });
  assertEquals(certificate.studentName, 'Ana Pérez Gil');
  assertEquals(certificate.nationalId?.value, '12345678Z');
  assertEquals(certificate.period.label, '2026/2027');
  assertEquals(certificate.signed, true);
});

Deno.test('EnrolmentCertificate should only carry the scanned signature of the default signer', () => {
  assertThrows(
    () => issue({ signer: new CertificateSigner('Lucía Moreno Gil', 'Secretaria'), signed: true }),
    InvalidValue,
    'La firma escaneada solo es la del firmante por defecto.',
  );
  assertThrows(
    () =>
      issue({ signer: new CertificateSigner('Manuel Orantes Taboada', 'Tesorero'), signed: true }),
    InvalidValue,
  );
  assertThrows(() => issue({ signed: true, signatureAvailable: false }), InvalidValue);
  // Otro firmante, firmando a mano.
  assertEquals(
    issue({ signer: new CertificateSigner('Lucía Moreno Gil', 'Secretaria') }).signer.name,
    'Lucía Moreno Gil',
  );
  // Mismo firmante aunque cambien espacios o mayúsculas.
  assertEquals(
    issue({
      signer: new CertificateSigner(' manuel orantes  taboada ', 'presidente'),
      signed: true,
    })
      .signed,
    true,
  );
});

Deno.test('CertificatePeriod should be a season with both years or a calendar year', () => {
  assertEquals(CertificatePeriod.of('year', ' 2025 ').label, '2025');
  assertEquals(CertificatePeriod.of('season', '2025/2026').kind, 'season');
  assertThrows(() => CertificatePeriod.of('season', '2026/2028'), InvalidValue);
  assertThrows(() => CertificatePeriod.of('season', '2026-27'), InvalidValue);
  assertThrows(() => CertificatePeriod.of('year', '2026/2027'), InvalidValue);
  assertThrows(() => CertificatePeriod.of('month', '2026'), InvalidValue);
  assertEquals(CertificatePeriod.of('season', '2025/2026').lastDay().toString(), '2026-06-30');
  assertEquals(CertificatePeriod.of('year', '2025').lastDay().toString(), '2025-12-31');
});

Deno.test('EnrolmentCertificate should not mention a DNI it does not have', () => {
  assertEquals(issue({ nationalId: null }).nationalId, null);
});

Deno.test('EnrolmentCertificate should need a schedule, a place, a signer and membership before the date', () => {
  assertThrows(
    () => issue({ memberSince: LocalDate.fromString('2026-11-12') }),
    InvalidValue,
    'no puede ser posterior',
  );
  // Ni pertenecer al club desde después de lo que certifica.
  assertThrows(
    () =>
      issue({
        period: CertificatePeriod.of('year', '2025'),
        memberSince: LocalDate.fromString('2026-01-01'),
      }),
    InvalidValue,
    'desde después del año',
  );
  assertEquals(
    issue({
      period: CertificatePeriod.of('season', '2025/2026'),
      memberSince: LocalDate.fromString('2026-06-30'),
    }).memberSince.toString(),
    '2026-06-30',
  );
  assertThrows(() => issue({ schedule: '  ' }), InvalidValue);
  assertThrows(() => issue({ place: '' }), InvalidValue);
  assertThrows(() => new CertificateSigner('', 'Presidente'), InvalidValue);
  assertThrows(() => new CertificateSigner('Manuel Orantes Taboada', ' '), InvalidValue);
});
