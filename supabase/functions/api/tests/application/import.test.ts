import { assert, assertEquals, assertFalse, assertThrows } from '@std/assert';

import { InvalidValue, LocalDate } from '../../src/domain/common/mod.ts';
import {
  looksLikeSamePerson,
  matchGroups,
  normaliseText,
  SpreadsheetParser,
} from '../../src/application/import/mod.ts';

const SHEET = [
  ',Fotos,,Cuota Anual,Chandal y polo,Federativa,Septiembre,Octubre,Noviembre,Diciembre,Enero,Febrero,Marzo,Abril,Mayo,Junio,Fecha Nacimiento,Madre ó Padre,Telefono,e-mail',
  'Julio Requena Montenegro,,,50,,,20,,,,,,,,,,7/2/17,Torcuato,690666005,torcuato@ejemplo.com',
  'Hector Perez Ratkovsky,,Tarjetero,50,,,55,55,,,,,,,,,19/9/2016,Lenka,699615279,lenka@ejemplo.com',
  'Martin Clemente Muñoz,,Bco.Santander,,,,,,,,,,,,,,11/8/2017,Luis,678810154,lclemor@ejemplo.com',
  'Alvaro Lopez Rivas,,,50,,,"49,5","49,5","49,5",,,,,,,,,,,',
  'Angel Zufri Gonzalez,,,50,,25,,36,36,36,,,,,,,30/5/2015,Susana y Gilberto,659049176,susigr_7@ejemplo.com',
  'Jose del Castillo Lindez,,,,,,,,,,,,,,,,29/1/2016,Encarnacion,653195878,jldelcastillo@ejemplo.com',
  ',,,,,,,,,,,,,,,,,,,',
].join('\n');

const parse = (text: string, today = '2026-10-05') =>
  new SpreadsheetParser().parse(text, LocalDate.fromString(today));

Deno.test('SpreadsheetParser should read students, payments and contact from a csv export', () => {
  const rows = parse(SHEET);
  assertEquals(rows.length, 6);
  const julio = rows[0];
  assertEquals(julio?.line, 2);
  assertEquals(julio?.fullName, 'Julio Requena Montenegro');
  assertEquals(julio?.birthDate, '2017-02-07');
  assertEquals(julio?.guardianName, 'Torcuato');
  assertEquals(julio?.guardianPhone, '690666005');
  assertEquals(julio?.email, 'torcuato@ejemplo.com');
  assertEquals(julio?.membershipCents, 5000);
  assertEquals(julio?.monthlyCents, { '2026-09': 2000 });
  assertEquals(julio?.warnings, []);
  assertEquals(rows[1]?.monthlyCents, { '2026-09': 5500, '2026-10': 5500 });
  assertEquals(rows[1]?.birthDate, '2016-09-19');
  assertEquals(rows[3]?.monthlyCents, { '2026-09': 4950, '2026-10': 4950, '2026-11': 4950 });
  assertEquals(rows[4]?.federationCents, 2500);
  assertEquals(rows[4]?.guardianName, 'Susana y Gilberto');
});

Deno.test('SpreadsheetParser should place january to june in the following year', () => {
  const row = parse('Nombre,Septiembre,Enero,Junio\nAna Prueba,10,20,30', '2027-02-01')[0];
  assertEquals(row?.monthlyCents, { '2026-09': 1000, '2027-01': 2000, '2027-06': 3000 });
});

Deno.test('SpreadsheetParser should accept pasted cells and semicolons and warn about bad values', () => {
  const luis = parse(
    'Nombre\tSeptiembre\tFecha Nacimiento\tTelefono\te-mail\nLuis Prueba\tveinte\t31/13/2015\t12345\tsin-arroba\n',
  )[0];
  const marta = parse('Nombre;Septiembre;Fecha Nacimiento\nMarta Prueba;"49,5";2/4/2011')[0];
  assertEquals(luis?.monthlyCents, {});
  assertEquals(luis?.birthDate, null);
  assertEquals(luis?.guardianPhone, null);
  assertEquals(luis?.email, null);
  assertEquals(luis?.warnings.length, 4);
  assertEquals(marta?.monthlyCents, { '2026-09': 4950 });
  assertEquals(marta?.birthDate, '2011-04-02');
});

Deno.test('SpreadsheetParser should fail clearly without a recognisable header', () => {
  assertThrows(() => parse('a,b,c\n1,2,3'), InvalidValue);
  assertEquals(normaliseText('  Héctor   PÉREZ '), 'hector perez');
});

Deno.test('SpreadsheetParser should read one or several group columns, with several groups per cell', () => {
  const sheet = [
    'Nombre,Fecha Nacimiento,Grupo 1,Grupo 2,Septiembre',
    'Lucía Prueba,12/3/2015,Lunes 17:00,Miércoles 17:00,20',
    'Javier Prueba,19/7/1984,Martes 17:00 Intermedio; Jueves 17:00 Intermedio,,36',
    'Sin Grupo,1/1/2010,,,10',
  ].join('\n');
  const rows = parse(sheet);
  assertEquals(rows[0]?.groups, ['Lunes 17:00', 'Miércoles 17:00']);
  assertEquals(rows[1]?.groups, ['Martes 17:00 Intermedio', 'Jueves 17:00 Intermedio']);
  assertEquals(rows[2]?.groups, []);
  assertEquals(parse('Nombre,Septiembre\nAna,10')[0]?.groups, []);
});

Deno.test('matchGroups should find a group by its name, its default name or words that describe it', () => {
  const groups = [
    {
      id: 'a',
      name: 'Lunes 17:00 · Iniciación · Alfil',
      defaultName: 'Lunes 17:00 · Iniciación · Alfil',
    },
    {
      id: 'b',
      name: 'Lunes 17:00 · Intermedio · Peón',
      defaultName: 'Lunes 17:00 · Intermedio · Peón',
    },
    { id: 'c', name: 'Competición', defaultName: 'Viernes 17:30 · Avanzado · Alfil' },
  ];
  const ids = (text: string) => matchGroups(text, groups).map((g) => g.id);
  assertEquals(ids('competicion'), ['c']);
  assertEquals(ids('Viernes 17:30 · Avanzado · Alfil'), ['c']);
  assertEquals(ids('Lunes 17:00'), ['a', 'b']);
  assertEquals(ids('lun 17:00 peon'), ['b']);
  assertEquals(ids('Lunes 17:00 Intermedio'), ['b']);
  assertEquals(ids('Vie 17:30'), ['c']);
  assertEquals(ids('Jueves 17:00'), []);
  assertEquals(ids('   '), []);
});

Deno.test('looksLikeSamePerson should need the same first name and compatible surnames', () => {
  assert(looksLikeSamePerson('Francisco', 'Francisco Rodríguez Gil'));
  assert(looksLikeSamePerson('Francisco Rodriguez', 'Francisco Rodríguez Gil'));
  assert(looksLikeSamePerson('hector perez', 'Héctor Pérez Ratkovsky'));
  assertFalse(looksLikeSamePerson('Mar García', 'Rafa García'));
  assertFalse(looksLikeSamePerson('Francisco Orantes', 'Francisco Rodríguez Gil'));
  assertFalse(looksLikeSamePerson('', 'Francisco Rodríguez'));
});
