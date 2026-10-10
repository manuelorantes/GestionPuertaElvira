import { type Clock, LocalDate, Season, YearMonth } from '../src/domain/common/mod.ts';
import { PayInvoice, RecordEntry, RegisterInvoice } from '../src/application/accounting/mod.ts';
import {
  GenerateMonthlyCharges,
  IssueInvoice,
  QuotePayment,
  RegisterPayment,
  UpdateStudentAccount,
} from '../src/application/billing/mod.ts';
import { CreateClassGroup } from '../src/application/classes/mod.ts';
import { PaySettlement, ProposeSessions } from '../src/application/payroll/mod.ts';
import { LinkSiblings, RegisterStudent } from '../src/application/students/mod.ts';
import { ChangeTeacherRate, RegisterTeacher } from '../src/application/teachers/mod.ts';
import { TeachersTeacherDirectory } from '../src/infrastructure/classes/routes.ts';
import { SqlAccountingRepository } from '../src/infrastructure/persistence/accounting.ts';
import {
  SqlBillingSettingsRepository,
  SqlChargeRepository,
  SqlClosedPeriods,
  SqlDocumentSequence,
  SqlPaymentRepository,
  SqlStudentAccountRepository,
  SqlStudentDirectory,
} from '../src/infrastructure/persistence/billing.ts';
import { SqlClassGroupRepository } from '../src/infrastructure/persistence/classes.ts';
import {
  SqlDutyRepository,
  SqlHolidayCalendar,
  SqlScheduleDirectory,
  SqlSettlementRepository,
  SqlSubstitutionRepository,
  SqlTeacherRates,
  SqlTimesheetRepository,
} from '../src/infrastructure/persistence/payroll.ts';
import {
  PostgresAdvisoryLocks,
  SavepointTransactionRunner,
  type TransactionSql,
} from '../src/infrastructure/persistence/sql.ts';
import { SqlStudentRepository } from '../src/infrastructure/persistence/students.ts';
import { SqlTeacherRepository } from '../src/infrastructure/persistence/teachers.ts';
import { ClassesEnrolments } from '../src/infrastructure/students/routes.ts';
import { PointsWalletService } from '../src/application/points/mod.ts';
import { PointMovement } from '../src/domain/points/mod.ts';
import { SqlPointMovementRepository } from '../src/infrastructure/persistence/points.ts';

/*
 * Datos de demostración FICTICIOS del diseño (profesorado, grupos, alumnos y cobros) para desarrollo
 * y tests. Se crean a través de los casos de uso, así que respetan las mismas reglas que la aplicación.
 */

const TEACHERS: Record<string, string> = {
  p1: 'Lucía Moreno Gil',
  p2: 'Carlos Ruiz Márquez',
  p3: 'Javier Ortega Sánchez',
  p4: 'Ana Belén Torres',
  p5: 'Miguel Á. Fernández',
};

/** Tarifa por hora del diseño. */
const RATES: Record<string, string> = { p1: '16', p2: '18', p3: '20', p4: '15', p5: '17' };

/** Profesor con la liquidación del mes anterior aún pendiente. */
const UNPAID_TEACHER = 'p5';

/** [nombre, nivel, profesor, días, inicio, fin, aula, plazas]. Las aulas: alfil, caballo y peon. */
const GROUPS: [string, string, string, string[], string, string, string, number][] = [
  ['Iniciación A', 'beginner', 'p1', ['mon', 'wed'], '17:00', '18:00', 'alfil', 12],
  ['Intermedio A', 'intermediate', 'p2', ['mon', 'wed'], '18:00', '19:30', 'alfil', 12],
  ['Avanzado A', 'advanced', 'p3', ['mon', 'wed'], '19:30', '21:00', 'alfil', 10],
  ['Iniciación C', 'beginner', 'p4', ['mon', 'wed'], '16:00', '17:00', 'caballo', 12],
  ['Intermedio C', 'intermediate', 'p5', ['mon', 'wed'], '17:00', '18:30', 'caballo', 12],
  ['Iniciación D', 'beginner', 'p1', ['mon', 'wed'], '18:30', '19:30', 'caballo', 12],
  ['Iniciación B', 'beginner', 'p4', ['tue', 'thu'], '17:00', '18:00', 'alfil', 12],
  ['Intermedio B', 'intermediate', 'p5', ['tue', 'thu'], '18:00', '19:30', 'alfil', 12],
  ['Adultos I', 'intermediate', 'p2', ['tue'], '19:30', '21:00', 'alfil', 12],
  ['Adultos II', 'intermediate', 'p5', ['thu'], '19:30', '21:00', 'alfil', 12],
  ['Peques B', 'beginner', 'p1', ['tue'], '16:00', '17:00', 'peon', 10],
  ['Iniciación E', 'beginner', 'p2', ['tue', 'thu'], '17:00', '18:00', 'caballo', 12],
  ['Avanzado B', 'advanced', 'p3', ['tue', 'thu'], '18:00', '19:30', 'caballo', 10],
  ['Peques A', 'beginner', 'p1', ['fri'], '16:30', '17:30', 'alfil', 10],
  ['Competición', 'advanced', 'p3', ['fri'], '17:30', '19:00', 'alfil', 12],
  ['Jóvenes talentos', 'beginner', 'p4', ['fri'], '19:00', '20:00', 'alfil', 10],
  ['Particular · jueves', 'private_lesson', 'p5', ['thu'], '19:30', '21:00', 'peon', 2],
  ['Particular · viernes', 'private_lesson', 'p3', ['fri'], '17:30', '19:00', 'peon', 2],
];

/**
 * [clave, nombre, nacimiento, grupo, tutores [nombre, teléfono], teléfono propio, licencia, autorización de imagen]
 * Todos los datos son ficticios.
 */
const STUDENTS: [
  string,
  string,
  string,
  string,
  [string, string][],
  string | null,
  string | null,
  boolean,
][] = [
  [
    'a1',
    'Martina López Herrera',
    '2014-03-12',
    'Intermedio A',
    [['Rocío Herrera', '612481930'], ['Daniel López', '612773041']],
    null,
    'AND-20417',
    true,
  ],
  [
    'a2',
    'Pablo López Herrera',
    '2017-01-22',
    'Iniciación A',
    [['Rocío Herrera', '612481930'], ['Daniel López', '612773041']],
    null,
    null,
    true,
  ],
  [
    'a3',
    'Hugo Martín Castillo',
    '2012-05-08',
    'Avanzado A',
    [['Pilar Castillo', '655210784'], ['Andrés Martín', '655901236']],
    null,
    'AND-18832',
    true,
  ],
  [
    'a4',
    'Sofía Ramírez Vílchez',
    '2016-02-15',
    'Iniciación B',
    [['Antonio Ramírez', '644903215']],
    null,
    null,
    true,
  ],
  [
    'a5',
    'Daniel Jiménez Molina',
    '2010-06-30',
    'Competición',
    [['Mercedes Molina', '688135602']],
    null,
    'AND-16205',
    true,
  ],
  [
    'a6',
    'Carmen Ruiz Prieto',
    '2018-04-03',
    'Peques A',
    [['Francisco Ruiz', '633704198'], ['Lucía Prieto', '633186420']],
    null,
    null,
    true,
  ],
  [
    'a7',
    'Alba Ruiz Prieto',
    '2015-09-11',
    'Iniciación B',
    [['Francisco Ruiz', '633704198'], ['Lucía Prieto', '633186420']],
    null,
    null,
    true,
  ],
  ['a8', 'Javier Navarro Pérez', '1984-07-19', 'Adultos I', [], '677528810', null, true],
  [
    'a9',
    'Irene Moreno Salas',
    '2013-03-27',
    'Intermedio B',
    [['Inmaculada Salas', '622347561']],
    null,
    null,
    false,
  ],
  [
    'a10',
    'Mateo Cano Robles',
    '2019-05-02',
    'Peques B',
    [['José Cano', '699052347']],
    null,
    null,
    true,
  ],
  [
    'a11',
    'Lucas García Medina',
    '2011-02-14',
    'Avanzado B',
    [['Teresa Medina', '611874026']],
    null,
    'AND-17940',
    true,
  ],
  [
    'a12',
    'Elena Torres Aguilar',
    '2014-08-21',
    'Intermedio C',
    [['Manuel Torres', '650661293']],
    null,
    null,
    true,
  ],
  [
    'a13',
    'Adrián Sáez Romero',
    '2016-06-09',
    'Iniciación C',
    [['Encarna Romero', '628410955']],
    null,
    null,
    false,
  ],
  [
    'a14',
    'Nerea Villar Campos',
    '2012-01-30',
    'Jóvenes talentos',
    [['Luis Villar', '666382071']],
    null,
    'AND-19358',
    true,
  ],
  [
    'a15',
    'Rubén Castro Linares',
    '2009-04-17',
    'Particular · viernes',
    [['Elena Linares', '645179203']],
    null,
    'AND-15876',
    true,
  ],
  ['a16', 'Clara Ibáñez Soto', '1988-03-05', 'Particular · jueves', [], '691224870', null, true],
];

const SIBLINGS: [string, string][] = [['a1', 'a2'], ['a6', 'a7']];

/** [alumno, forma de pago preferida, socio, precio pactado de particulares, puntos] */
const ACCOUNTS: [string, string, boolean, string | null, number][] = [
  ['a1', 'three_months', true, null, 0],
  ['a3', 'monthly', true, null, 3],
  ['a5', 'six_months', true, null, 5],
  ['a8', 'monthly', true, null, 0],
  ['a15', 'monthly', false, '35', 0],
];

/** Quien no ha pagado los meses anteriores (para ver cuotas vencidas). */
const OVERDUE = ['a9', 'a13'];

/** Quien ya ha pagado el mes actual, y cuántos meses de una vez. */
const PAID_THIS_MONTH: Record<string, number> = {
  a1: 3,
  a3: 1,
  a5: 1,
  a6: 1,
  a7: 1,
  a8: 1,
  a11: 1,
  a14: 1,
};

/** Cuotas de socio ya pagadas. */
const MEMBERSHIP_PAID = ['a1', 'a3', 'a5'];

/** Facturas del diseño: [día, mes relativo (0 actual, -1 anterior), nº, proveedor, concepto, categoría, importe, pagada]. */
const INVOICES: [number, number, string, string, string, string, string, boolean][] = [
  [1, 0, 'R-ALQ', 'Propietario del local', 'Alquiler del mes', 'rent', '950', true],
  [
    1,
    0,
    'FAA-3381',
    'Federación Andaluza de Ajedrez',
    'Licencias federativas (12)',
    'federation',
    '144',
    true,
  ],
  [
    2,
    0,
    'E-0912',
    'Escaque Material Didáctico',
    'Tablero mural de demostración',
    'material',
    '86',
    true,
  ],
  [
    28,
    -1,
    'E-0897',
    'Escaque Material Didáctico',
    'Relojes digitales (4)',
    'material',
    '186',
    true,
  ],
  [
    25,
    -1,
    'TP-044',
    'Organización torneo provincial',
    'Inscripción por equipos',
    'tournaments',
    '120',
    false,
  ],
  [22, -1, 'S-55120', 'Compañía de suministros', 'Luz y agua', 'utilities', '86,40', true],
  [1, -1, 'R-ALQ', 'Propietario del local', 'Alquiler del mes', 'rent', '950', true],
];

/** Tablas que se vacían con `--reset` (en orden seguro para las claves ajenas). */
const RESET_TABLES = [
  // El material apunta a cuotas y los cobros de material a su cuota: van antes.
  'equipment_order',
  'equipment_purchase',
  'equipment_product',
  'points_movement',
  'points_photo',
  'attendance_absence',
  'attendance_roll_call',
  'accounting_entry',
  'accounting_invoice',
  'accounting_closing',
  'payroll_session',
  'payroll_settlement',
  'payroll_proposed_month',
  'payroll_proposed_day',
  'payroll_substitution',
  'payroll_duty',
  'payroll_holiday',
  'billing_payment',
  'billing_charge',
  'billing_account',
  'billing_settings',
  'billing_document_sequence',
  'classes_enrolment',
  'students_student',
  'classes_group',
  'teachers_teacher',
  // El historial de los datos borrados ya no se puede restaurar: se empieza de cero.
  'audit_change',
  'audit_action',
];

function id(ids: Record<string, string>, key: string): string {
  const value = ids[key];
  if (value === undefined) throw new Error(`Clave de demostración desconocida: ${key}`);
  return value;
}

/** Los casos de uso de cada contexto sobre la misma transacción (lo que hacen las rutas por petición). */
function useCases(tx: TransactionSql, clock: Clock) {
  const transactions = new SavepointTransactionRunner(tx);
  const locks = new PostgresAdvisoryLocks(tx);
  const closed = new SqlClosedPeriods(tx);
  const teachers = new SqlTeacherRepository(tx);
  const students = new SqlStudentRepository(tx);
  const directory = new SqlStudentDirectory(tx);
  const settings = new SqlBillingSettingsRepository(tx);
  const accounts = new SqlStudentAccountRepository(tx);
  const charges = new SqlChargeRepository(tx);
  const payments = new SqlPaymentRepository(tx);
  const sequence = new SqlDocumentSequence(tx);
  const timesheets = new SqlTimesheetRepository(tx);
  const settlements = new SqlSettlementRepository(tx);
  const rates = new SqlTeacherRates(tx);
  const accounting = new SqlAccountingRepository(tx);
  const points = new SqlPointMovementRepository(tx);
  const quotes = new QuotePayment(
    directory,
    settings,
    accounts,
    charges,
    clock,
    new PointsWalletService(points),
  );
  const noDocuments = {
    put: () => Promise.reject(new Error('La demostración no adjunta documentos.')),
    read: () => Promise.reject(new Error('La demostración no adjunta documentos.')),
    remove: () => Promise.resolve(),
  };
  return {
    registerTeacher: new RegisterTeacher(teachers),
    changeRate: new ChangeTeacherRate(teachers),
    createGroup: new CreateClassGroup(
      new SqlClassGroupRepository(tx),
      new TeachersTeacherDirectory(tx),
    ),
    registerStudent: new RegisterStudent(
      students,
      new ClassesEnrolments(tx, clock),
      transactions,
      clock,
    ),
    linkSiblings: new LinkSiblings(students, transactions),
    updateAccount: new UpdateStudentAccount(accounts),
    points,
    generateCharges: new GenerateMonthlyCharges(
      directory,
      settings,
      accounts,
      charges,
      clock,
      transactions,
      locks,
    ),
    registerPayment: new RegisterPayment(
      quotes,
      charges,
      payments,
      sequence,
      transactions,
      closed,
      locks,
      accounts,
    ),
    issueInvoice: new IssueInvoice(payments, sequence, transactions, clock, locks),
    proposeSessions: new ProposeSessions(
      new SqlScheduleDirectory(tx),
      new SqlDutyRepository(tx),
      new SqlSubstitutionRepository(tx),
      new SqlHolidayCalendar(tx),
      timesheets,
      settlements,
      settlements,
      clock,
      transactions,
      locks,
    ),
    paySettlement: new PaySettlement(timesheets, settlements, rates, closed, transactions, locks),
    registerInvoice: new RegisterInvoice(accounting, noDocuments, closed, accounting),
    payInvoice: new PayInvoice(accounting, closed),
    recordEntry: new RecordEntry(accounting, closed, accounting),
  };
}

type UseCases = ReturnType<typeof useCases>;

/** Crea profesorado, grupos, alumnos, cobros, nóminas y contabilidad de demostración; con `reset` borra antes lo local. */
export async function seedDemoData(
  tx: TransactionSql,
  clock: Clock,
  reset: boolean,
): Promise<string> {
  if (reset) {
    for (const table of RESET_TABLES) await tx.unsafe(`DELETE FROM ${table}`);
  }
  if ((await tx`SELECT 1 FROM classes_group LIMIT 1`).length > 0) {
    return 'Ya hay grupos: no se crean datos de demostración.';
  }
  const app = useCases(tx, clock);
  const teacherIds: Record<string, string> = {};
  for (const [key, name] of Object.entries(TEACHERS)) {
    teacherIds[key] = await app.registerTeacher.execute(name);
  }
  for (const [key, rate] of Object.entries(RATES)) {
    await app.changeRate.execute(id(teacherIds, key), rate);
  }
  const groupIds: Record<string, string> = {};
  for (const [name, level, teacher, days, start, end, classroom, capacity] of GROUPS) {
    groupIds[name] = await app.createGroup.execute({
      name,
      level,
      teacherId: id(teacherIds, teacher),
      days,
      start,
      end,
      classroom,
      capacity,
    });
  }
  const studentIds: Record<string, string> = {};
  for (
    const [key, name, birthDate, group, guardians, ownPhone, licence, imageConsent] of STUDENTS
  ) {
    const first = (guardians[0]?.[0] ?? name).split(' ')[0] ?? name;
    const email = `${first.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '')}@ejemplo.com`;
    studentIds[key] = await app.registerStudent.execute(
      {
        fullName: name,
        birthDate,
        nationalId: null,
        contactEmail: email,
        guardians: guardians.map(([n, phone]) => ({ name: n, phone })),
        ownPhone,
        federationLicence: licence,
        imageConsent,
      },
      [{ groupId: id(groupIds, group), attendance: null }],
      [],
      false,
    );
  }
  for (const [a, b] of SIBLINGS) {
    await app.linkSiblings.execute(id(studentIds, a), id(studentIds, b));
  }
  const payments = await seedBilling(tx, app, clock, studentIds);
  await seedPayroll(app, clock, teacherIds);
  await seedAttendance(tx, clock, teacherIds);
  await seedAccounting(app, clock);
  return `Creados ${
    Object.keys(TEACHERS).length
  } profesores, ${GROUPS.length} grupos, ${STUDENTS.length} alumnos y ${payments} cobros de demostración.`;
}

/** Alta desde el inicio de temporada, cuotas de cada mes hasta hoy y cobros con fecha de hoy. */
async function seedBilling(
  tx: TransactionSql,
  app: UseCases,
  clock: Clock,
  studentIds: Record<string, string>,
): Promise<number> {
  const today = LocalDate.fromInstant(clock.now());
  const current = YearMonth.of(today);
  const season = Season.teachingSeason(current);
  if (season === null) return 0;
  const start = `${season.firstMonth().toString()}-01`;
  await tx`UPDATE students_student SET joined_on = ${start}`;
  await tx`UPDATE classes_enrolment SET enrolled_on = ${start}`;
  for (const [key, plan, member, rate, points] of ACCOUNTS) {
    await app.updateAccount.execute(id(studentIds, key), plan, member, rate);
    // Puntos de este mes, para poder probar el canje al cobrar.
    if (points > 0) {
      await app.points.add(
        PointMovement.manual(id(studentIds, key), today, points, 'Puntos de demostración', null),
      );
    }
  }
  const previous: YearMonth[] = [];
  for (let month = season.firstMonth(); !current.isBefore(month); month = month.next()) {
    await app.generateCharges.execute(month.toString());
    if (month.isBefore(current)) previous.push(month);
  }
  const pay = (key: string, months: number, kind = 'monthly', method = 'transfer', date?: string) =>
    app.registerPayment.execute({
      studentId: id(studentIds, key),
      kind,
      months,
      method,
      date: date ?? today.toString(),
      specialPercent: null,
      specialAmountCents: null,
      specialConcept: null,
      redeemPoints: 0,
    });
  let count = 0;
  // Los meses anteriores se cobraron en plazo, cada uno en su mes.
  for (const month of previous) {
    for (const key of Object.keys(studentIds)) {
      if (OVERDUE.includes(key)) continue;
      const day = String(2 + count % 3).padStart(2, '0');
      await pay(
        key,
        1,
        'monthly',
        count % 3 === 0 ? 'cash' : 'transfer',
        `${month.toString()}-${day}`,
      );
      count++;
    }
  }
  for (const [key, months] of Object.entries(PAID_THIS_MONTH)) {
    await pay(key, Math.min(months, season.monthsFrom(current)));
    count++;
  }
  for (const key of MEMBERSHIP_PAID) {
    const paymentId = await pay(key, 1, 'membership', 'cash');
    count++;
    if (key === 'a1') {
      await app.issueInvoice.execute(
        paymentId,
        'Rocío Herrera',
        '00000000T',
        'Calle Elvira 1, Granada',
      );
    }
  }
  return count;
}

/** Sesiones propuestas desde septiembre y liquidaciones de los meses anteriores pagadas (salvo una). */
async function seedPayroll(
  app: UseCases,
  clock: Clock,
  teacherIds: Record<string, string>,
): Promise<void> {
  const current = YearMonth.of(LocalDate.fromInstant(clock.now()));
  const season = Season.teachingSeason(current);
  if (season === null) return;
  // Las horas se apuntan solas día a día (desde el mes anterior hasta hoy).
  await app.proposeSessions.execute();
  for (let month = season.firstMonth(); !current.isBefore(month); month = month.next()) {
    if (!month.isBefore(current)) continue;
    for (const [key, teacherId] of Object.entries(teacherIds)) {
      if (key !== UNPAID_TEACHER || month.next().isBefore(current)) {
        await app.paySettlement.execute(
          teacherId,
          month.toString(),
          `${month.next().toString()}-02`,
        );
      }
    }
  }
}

/**
 * Asistencia de la última semana: la cuenta de pruebas de profesorado es la de Lucía (vinculada hace una semana); sus
 * listas están pasadas, con alguna falta, salvo las del primer día, que salen en «Listas sin pasar». Los demás
 * profesores no tienen cuenta, así que sus clases no avisan; aun así se pasan sus listas para ver la asistencia.
 */
async function seedAttendance(
  tx: TransactionSql,
  clock: Clock,
  teacherIds: Record<string, string>,
): Promise<void> {
  const today = LocalDate.fromInstant(clock.now());
  const since = today.plusDays(-7).toString();
  const lucia = id(teacherIds, 'p1');
  await tx`UPDATE identity_user SET teacher_id = ${lucia}, teacher_linked_at = ${since}
            WHERE email = 'profe@puertaelvira.test' AND role = 'teacher'`;
  await tx`INSERT INTO attendance_settings (id, since) VALUES (1, ${since})
           ON CONFLICT (id) DO UPDATE SET since = EXCLUDED.since`;
  await tx`
    INSERT INTO attendance_roll_call (group_id, roll_date, kind, taken_by_teacher, taken_at)
    SELECT s.group_id, s.session_date, 'taken', s.teacher_id, now()
      FROM payroll_session s
     WHERE s.group_id IS NOT NULL AND s.session_date BETWEEN ${since} AND ${today.toString()}
       AND NOT (s.teacher_id = ${lucia} AND s.session_date = (
             SELECT min(f.session_date) FROM payroll_session f
              WHERE f.teacher_id = ${lucia} AND f.group_id IS NOT NULL AND f.session_date >= ${since}))
    ON CONFLICT DO NOTHING`;
  // Una falta en cada una de las tres primeras listas: el primer alumno de esa clase.
  await tx`
    INSERT INTO attendance_absence (group_id, roll_date, student_id)
    SELECT r.group_id, r.roll_date,
           (SELECT e.student_id FROM classes_enrolment e WHERE e.class_group_id = r.group_id
             ORDER BY e.student_id LIMIT 1)
      FROM (SELECT * FROM attendance_roll_call ORDER BY roll_date, group_id LIMIT 3) r
     WHERE EXISTS (SELECT 1 FROM classes_enrolment e WHERE e.class_group_id = r.group_id)
    ON CONFLICT DO NOTHING`;
}

/** Facturas de proveedores del mes actual y del anterior, y un par de apuntes manuales. */
async function seedAccounting(app: UseCases, clock: Clock): Promise<void> {
  const current = YearMonth.of(LocalDate.fromInstant(clock.now()));
  for (const [day, offset, number, supplier, concept, category, amount, paid] of INVOICES) {
    const month = offset === -1 ? current.previous() : current;
    const date = `${month.toString()}-${String(Math.min(day, month.days())).padStart(2, '0')}`;
    const invoice = await app.registerInvoice.execute(
      { date, number, supplier, concept: `${concept} · ${month.label()}`, category, amount },
      null,
    );
    if (paid) await app.payInvoice.execute(invoice, date, 'transfer');
  }
  await app.recordEntry.execute({
    date: `${current.toString()}-02`,
    kind: 'expense',
    concept: 'Comisión de mantenimiento de la cuenta',
    category: 'other_expenses',
    method: 'card',
    amount: '6',
  });
  await app.recordEntry.execute({
    date: `${current.toString()}-03`,
    kind: 'income',
    concept: 'Venta de libros de ajedrez',
    category: 'other_income',
    method: 'cash',
    amount: '45',
  });
}

/** Crea las cuotas del mes que falten (por defecto, el actual). Pensado para programarse el día 1 de cada mes. */
export async function generateCharges(
  tx: TransactionSql,
  clock: Clock,
  month: string | null,
): Promise<string> {
  const period = month === null
    ? YearMonth.of(LocalDate.fromInstant(clock.now()))
    : YearMonth.fromString(month);
  await useCases(tx, clock).generateCharges.execute(period.toString());
  return `Cuotas de ${period.label()} generadas.`;
}

/** Apunta las horas automáticas que falten, desde el mes anterior hasta hoy (lo lanza cada noche un workflow). */
export async function proposeSessions(tx: TransactionSql, clock: Clock): Promise<string> {
  await useCases(tx, clock).proposeSessions.execute();
  return `Horas automáticas apuntadas hasta el ${LocalDate.fromInstant(clock.now()).toString()}.`;
}
