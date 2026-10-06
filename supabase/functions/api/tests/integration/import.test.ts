import { assert, assertEquals, assertStringIncludes } from '@std/assert';

import { LocalDate, Season, YearMonth } from '../../src/domain/common/mod.ts';
import { newGroup, newTeacher } from '../support/classes-http.ts';
import { ApiClient, assertError, createUser, resetDatabase } from '../support/http.ts';

const SHEET = [
  ',Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Noviembre,Diciembre,Enero,Febrero,Marzo,Abril,Mayo,Junio,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail,Grupo',
  'Hector Perez Ratkovsky,,Tarjetero,50,,,55,55,,,,,,,,,19/9/2016,Lenka,699615279,lenka@ejemplo.com,Grupo inexistente',
  'Julio Requena Montenegro,,,50,25,,20,,,,,,,,,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com,Lun 17:00',
  'Hector Perez,,,,,,30,,,,,,,,,,11/8/2017,Luis,678810154,lclemor@ejemplo.com',
  'Peque Sin Telefono,,,,,,20,,,,,,,,,,1/1/2019,,,',
].join('\n');

const seasonStart = Season.containing(YearMonth.of(LocalDate.fromInstant(new Date()))).firstMonth()
  .toString();

interface Fixture {
  client: ApiClient;
  group: string;
  hector: string;
}

async function fixture(): Promise<Fixture> {
  await resetDatabase();
  await createUser('junta@club.es', 'superadministrator');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  const teacher = await newTeacher(client);
  const group = await newGroup(client, teacher);
  const response = await client.json('POST', '/api/admin/students', {
    fullName: 'Héctor Pérez Ratkovsky',
    birthDate: '2016-09-19',
    guardians: [{ name: 'Lenka', phone: '699615279' }],
    imageConsent: true,
    groupIds: [group],
  });
  assertEquals(response.status, 201);
  const brother = await client.json('POST', '/api/admin/students', {
    fullName: 'Rafael Pérez Ratkovsky',
    guardians: [{ name: 'Lenka', phone: '699615279' }],
    groupIds: [group],
  });
  assertEquals(brother.status, 201);
  return { client, group, hector: (response.body as { id: string }).id };
}

const body = <T>(response: { body: unknown }) => response.body as T;
const importRow = (fx: Fixture, row: Record<string, unknown>) =>
  fx.client.json('POST', '/api/admin/import/rows', { text: SHEET, row });
const total = async (fx: Fixture) =>
  body<{ total: number }>(await fx.client.get('/api/admin/students?filter=all')).total;

Deno.test('import should preview matches and proposals without saving', async () => {
  const fx = await fixture();
  const rows = body<{ rows: Record<string, unknown>[] }>(
    await fx.client.json('POST', '/api/admin/import/preview', { text: SHEET }),
  ).rows;
  assertEquals(rows.length, 4);
  assertEquals((rows[0]?.match as { id: string }).id, fx.hector, 'coincide sin tildes');
  assertEquals(rows[1]?.match, null);
  assertEquals(rows[1]?.birthDate, '2017-02-07');
  assertEquals(rows[1]?.monthlyCents, { [seasonStart]: 2000 });
  assertEquals(rows[1]?.kitCents, 2500);
  assertEquals(rows[1]?.groups, [{ text: 'Lun 17:00', groupId: fx.group }], 'grupo por día y hora');
  assertEquals(rows[0]?.groups, [{ text: 'Grupo inexistente', groupId: null }]);
  assert((rows[0]?.warnings as string[]).includes('No se encuentra el grupo «Grupo inexistente».'));
  assertEquals(
    (rows[2]?.suggestions as { fullName: string }[]).map((c) => c.fullName),
    ['Héctor Pérez Ratkovsky'],
    'mismo nombre de pila y apellido compatible; no el hermano con otro nombre',
  );
  assertEquals(await total(fx), 2, 'la revisión no guarda nada');
  assertError(
    await fx.client.json('POST', '/api/admin/import/preview', { text: 'a,b\n1,2' }),
    422,
    'unprocessable',
  );
});

Deno.test('import should import each row on its own as an undoable action', async () => {
  const fx = await fixture();
  const linked = await importRow(fx, { line: 2, action: 'link', studentId: fx.hector });
  assertEquals(linked.status, 200, JSON.stringify(linked.body));
  assertEquals(linked.body, {
    line: 2,
    action: 'link',
    studentId: fx.hector,
    studentName: 'Hector Perez Ratkovsky',
    payments: 3,
    member: true,
    entries: 0,
  });

  const created = await importRow(fx, {
    line: 3,
    action: 'create',
    groupIds: [fx.group],
    guardianName: 'Torcuato Requena',
  });
  assertEquals(created.status, 200, JSON.stringify(created.body));
  const result = body<Record<string, unknown>>(created);
  assertEquals(result.payments, 2);
  assertEquals(result.entries, 1);
  const julio = String(result.studentId);
  const detail = body<Record<string, unknown>>(await fx.client.get(`/api/admin/students/${julio}`));
  assertEquals(detail.joinedOn, `${seasonStart}-01`);
  assertEquals(detail.guardians, [{ name: 'Torcuato Requena', phone: '690 66 60 05' }]);
  assertEquals(
    body<{ member: boolean }>(await fx.client.get(`/api/admin/billing/accounts/${julio}`)).member,
    true,
  );
  const ledger = body<{ items: { concept: string }[] }>(
    await fx.client.get(`/api/admin/accounting/ledger?month=${seasonStart}`),
  );
  assert(ledger.items.some((l) => l.concept === 'Chándal y polo · Julio Requena Montenegro'));

  const actions =
    body<{ items: Record<string, unknown>[] }>(await fx.client.get('/api/admin/audit/actions'))
      .items;
  assertEquals(actions.slice(0, 2).map((a) => a.label), [
    'Importar fila de la hoja: Julio Requena Montenegro',
    'Importar fila de la hoja: Hector Perez Ratkovsky',
  ]);
  assertEquals(
    (await fx.client.json('POST', `/api/admin/audit/actions/${actions[0]?.id}/undo`)).status,
    204,
  );
  assertEquals(await total(fx), 2, 'solo se deshace la fila de Julio');
  assertEquals(
    body<{ items: unknown[] }>(
      await fx.client.get(`/api/admin/billing/payments?studentId=${fx.hector}`),
    ).items.length,
    3,
    'la fila de Héctor sigue importada',
  );
  assertEquals(
    body<Record<string, unknown>>(await importRow(fx, { line: 2, action: 'skip' })).payments,
    0,
  );
});

Deno.test('import should warn about a possible duplicate before creating', async () => {
  const fx = await fixture();
  const duplicate = await importRow(fx, { line: 4, action: 'create', groupIds: [fx.group] });
  assertError(duplicate, 409, 'possible_duplicate');
  assertStringIncludes(
    body<{ error: { message: string } }>(duplicate).error.message,
    'Héctor Pérez Ratkovsky',
  );
  assertEquals(
    body<{ error: { details: { candidates: string } } }>(duplicate).error.details.candidates,
    fx.hector,
  );
  assertEquals(
    (await importRow(fx, {
      line: 4,
      action: 'create',
      groupIds: [fx.group],
      confirmDuplicate: true,
    })).status,
    200,
  );
  assertEquals(await total(fx), 3);
});

Deno.test('import should fail only the bad row and save nothing of it', async () => {
  const fx = await fixture();
  assertError(
    await importRow(fx, { line: 5, action: 'create', groupIds: [fx.group], email: 'sin-arroba' }),
    422,
    'unprocessable',
  );
  assertError(
    await importRow(fx, { line: 9, action: 'link', studentId: fx.hector }),
    422,
    'unprocessable',
  );
  assertEquals(
    (await importRow(fx, { line: 2, action: 'link', studentId: fx.hector })).status,
    200,
  );
  assertEquals(await total(fx), 2);
});

Deno.test('import is reserved to superadministrators', async () => {
  await resetDatabase();
  await createUser('junta@club.es', 'administrator');
  const client = new ApiClient();
  await client.logIn('junta@club.es');
  assertError(
    await client.json('POST', '/api/admin/import/preview', { text: SHEET }),
    403,
    'forbidden',
  );
  assertError(
    await client.json('POST', '/api/admin/import/rows', {
      text: SHEET,
      row: { line: 2, action: 'skip' },
    }),
    403,
    'forbidden',
  );
});
