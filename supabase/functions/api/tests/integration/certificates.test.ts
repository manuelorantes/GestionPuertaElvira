import { assertEquals } from '@std/assert';

import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, atTime, createUser, resetDatabase } from '../support/http.ts';

const body = <T>(response: { body: unknown }) => response.body as T;
const NOVEMBER_11 = '2026-11-11T10:00:00+01:00';
// Cabecera PNG mínima: basta para reconocer el tipo por el contenido.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

interface Draft {
  studentName: string;
  nationalId: string | null;
  memberSince: string;
  season: string;
  year: string;
  schedule: string;
  place: string;
  issuedOn: string;
  signer: { name: string; role: string };
  signatureAvailable: boolean;
}

interface Certificate {
  id: string;
  studentName: string;
  nationalId: string | null;
  periodKind: 'season' | 'year';
  period: string;
  schedule: string;
  memberSince: string;
  place: string;
  issuedOn: string;
  signer: { name: string; role: string };
  signed: boolean;
  issuedByName: string | null;
  club: { name: string; taxId: string; address: string };
}

async function fixture() {
  await resetDatabase();
  await createUser('junta@club.es');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const group = await newGroup(client, await newTeacher(client), {
    name: 'Intermedio V',
    days: ['fri'],
    start: '17:00',
    end: '18:30',
  });
  const created = await client.json('POST', '/api/admin/students', {
    fullName: 'Ana Pérez Gil',
    joinedOn: '2025-09-15',
    groupIds: [group],
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  return { client, ana: body<{ id: string }>(created).id };
}

function signatureForm(file: Uint8Array) {
  const form = new FormData();
  form.append('file', new File([file as unknown as ArrayBuffer], 'firma.png'));
  return form;
}

Deno.test('An enrolment certificate should be proposed from the student, issued and kept on record', async () => {
  await atTime(NOVEMBER_11, async () => {
    const { client, ana } = await fixture();

    // Lo que se propone: sus datos, el curso, su horario, Granada, hoy y el firmante por defecto (sin firma subida aún).
    const draft = body<Draft>(await client.get(`/api/admin/students/${ana}/certificates/draft`));
    assertEquals(draft, {
      studentName: 'Ana Pérez Gil',
      nationalId: null,
      memberSince: '2025-09-15',
      season: '2026/2027',
      year: '2026',
      schedule: 'los viernes de 17:00 a 18:30 horas',
      place: 'Granada',
      issuedOn: '2026-11-11',
      signer: { name: 'Manuel Orantes Taboada', role: 'Presidente' },
      signatureAvailable: false,
    });

    const request = {
      periodKind: 'season',
      period: draft.season,
      schedule: draft.schedule,
      place: draft.place,
      issuedOn: draft.issuedOn,
      signerName: draft.signer.name,
      signerRole: draft.signer.role,
      signed: false,
    };
    // Sin DNI, el certificado no lo menciona y su ficha sigue sin él.
    const withoutId = await client.json('POST', `/api/admin/students/${ana}/certificates`, {
      ...request,
      nationalId: '',
    });
    assertEquals(withoutId.status, 201, JSON.stringify(withoutId.body));
    assertEquals(body<Certificate>(withoutId).nationalId, null);
    assertEquals(
      body<{ nationalId: string | null }>(await client.get(`/api/admin/students/${ana}`))
        .nationalId,
      null,
    );
    // La firma escaneada aún no se ha subido.
    assertError(
      await client.json('POST', `/api/admin/students/${ana}/certificates`, {
        ...request,
        nationalId: '12345678Z',
        signed: true,
      }),
      422,
      'unprocessable',
    );
    const issued = await client.json('POST', `/api/admin/students/${ana}/certificates`, {
      ...request,
      nationalId: '12345678z',
    });
    assertEquals(issued.status, 201, JSON.stringify(issued.body));
    const certificate = body<Certificate>(issued);
    assertEquals(certificate.nationalId, '12345678Z');
    assertEquals(certificate.periodKind, 'season');
    assertEquals(certificate.period, '2026/2027');
    assertEquals(certificate.memberSince, '2025-09-15');
    assertEquals(certificate.signed, false);
    assertEquals(certificate.club.name.length > 0, true);
    const detail = body<{ nationalId: string }>(await client.get(`/api/admin/students/${ana}`));
    assertEquals(detail.nationalId, '12345678Z');
    assertEquals(
      body<Draft>(await client.get(`/api/admin/students/${ana}/certificates/draft`)).nationalId,
      '12345678Z',
    );

    // Con la firma subida, el firmante por defecto puede firmar; otro firmante, solo a mano.
    const upload = await client.request('POST', '/api/admin/students/certificate-signature', {
      body: signatureForm(PNG),
      headers: { 'X-Requested-With': 'fetch' },
    });
    assertEquals(upload.status, 204, JSON.stringify(upload.body));
    assertError(
      await client.request('POST', '/api/admin/students/certificate-signature', {
        body: signatureForm(new TextEncoder().encode('%PDF-1.4 no es una imagen')),
        headers: { 'X-Requested-With': 'fetch' },
      }),
      422,
      'unprocessable',
    );
    const image = await client.raw('GET', '/api/admin/students/certificate-signature');
    assertEquals(image.status, 200);
    assertEquals(image.headers.get('Content-Type'), 'image/png');
    assertEquals(new Uint8Array(await image.arrayBuffer()), PNG);

    const signed = await client.json('POST', `/api/admin/students/${ana}/certificates`, {
      ...request,
      signed: true,
    });
    assertEquals(signed.status, 201, JSON.stringify(signed.body));
    assertEquals(body<Certificate>(signed).signed, true);
    assertError(
      await client.json('POST', `/api/admin/students/${ana}/certificates`, {
        ...request,
        signerName: 'Lucía Moreno Gil',
        signerRole: 'Secretaria',
        signed: true,
      }),
      422,
      'unprocessable',
    );

    // El registro: los certificados de la alumna, del último al primero, y cada uno se puede volver a imprimir.
    const list = body<{ items: Certificate[] }>(
      await client.get(`/api/admin/students/${ana}/certificates`),
    );
    assertEquals(list.items.map((c) => c.signed), [true, false, false]);
    assertEquals(list.items[0]?.issuedByName !== null, true);
    const again = body<Certificate>(
      await client.get(`/api/admin/students/${ana}/certificates/${certificate.id}`),
    );
    assertEquals(again.schedule, 'los viernes de 17:00 a 18:30 horas');

    // Firmante por defecto configurable: al cambiarlo, la firma escaneada ya no es suya y se quita.
    assertEquals(
      (await client.json('PUT', '/api/admin/students/certificate-settings', {
        signerName: 'Lucía Moreno Gil',
        signerRole: 'Secretaria',
      })).status,
      204,
    );
    const settings = body<{ signerName: string; signatureAvailable: boolean }>(
      await client.get('/api/admin/students/certificate-settings'),
    );
    assertEquals(
      settings,
      {
        signerName: 'Lucía Moreno Gil',
        signerRole: 'Secretaria',
        signatureAvailable: false,
      } as typeof settings,
    );
    assertEquals(
      (await client.raw('GET', '/api/admin/students/certificate-signature')).status,
      404,
    );
  });
});

Deno.test('A certificate should certify a whole year, also one from before the app, with the date given', async () => {
  await atTime(NOVEMBER_11, async () => {
    const { client, ana } = await fixture();
    const request = {
      nationalId: '12345678Z',
      periodKind: 'year',
      period: '2025',
      memberSince: '2024-09-16',
      schedule: 'los viernes de 17:00 a 18:30 horas',
      place: 'Granada',
      issuedOn: '2026-11-11',
      signerName: 'Manuel Orantes Taboada',
      signerRole: 'Presidente',
      signed: false,
    };
    const issued = await client.json('POST', `/api/admin/students/${ana}/certificates`, request);
    assertEquals(issued.status, 201, JSON.stringify(issued.body));
    const certificate = body<Certificate>(issued);
    assertEquals(
      [certificate.periodKind, certificate.period, certificate.memberSince],
      ['year', '2025', '2024-09-16'],
    );
    // Su alta en la ficha no cambia.
    assertEquals(
      body<{ joinedOn: string }>(await client.get(`/api/admin/students/${ana}`)).joinedOn,
      '2025-09-15',
    );
    for (
      const wrong of [
        { period: '25' },
        { periodKind: 'month' },
        { periodKind: 'season', period: '2025' },
        { memberSince: '2026-12-01' },
        // Pertenecer desde después del año que certifica.
        { memberSince: '2026-01-10' },
      ]
    ) {
      assertError(
        await client.json('POST', `/api/admin/students/${ana}/certificates`, {
          ...request,
          ...wrong,
        }),
        422,
        'unprocessable',
      );
    }
  });
});

Deno.test('Removing the scanned signature should leave certificates to be signed by hand', async () => {
  await atTime(NOVEMBER_11, async () => {
    const { client } = await fixture();
    await client.request('POST', '/api/admin/students/certificate-signature', {
      body: signatureForm(PNG),
      headers: { 'X-Requested-With': 'fetch' },
    });
    assertEquals(
      (await client.json('DELETE', '/api/admin/students/certificate-signature')).status,
      204,
    );
    assertEquals(
      body<{ signatureAvailable: boolean }>(
        await client.get('/api/admin/students/certificate-settings'),
      ).signatureAvailable,
      false,
    );
  });
});
