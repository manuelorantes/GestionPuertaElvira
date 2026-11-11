import { assertEquals, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
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
    season: '2026/2027',
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
  assertEquals(certificate.nationalId.value, '12345678Z');
  assertEquals(certificate.season, '2026/2027');
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

Deno.test('EnrolmentCertificate should need a season, a schedule, a place and a signer', () => {
  assertThrows(() => issue({ season: '2026/2028' }), InvalidValue);
  assertThrows(() => issue({ season: '2026-27' }), InvalidValue);
  assertThrows(() => issue({ schedule: '  ' }), InvalidValue);
  assertThrows(() => issue({ place: '' }), InvalidValue);
  assertThrows(() => new CertificateSigner('', 'Presidente'), InvalidValue);
  assertThrows(() => new CertificateSigner('Manuel Orantes Taboada', ' '), InvalidValue);
});
