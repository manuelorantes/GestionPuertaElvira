import { apiGet, apiSend } from '@/shared/api/client';

export interface Session {
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  groupId: string | null;
  label: string;
  /** Duración de la sesión. */
  minutes: number;
  /** Lo que cuenta: menos si se pisa con otra sesión suya del mismo día, que se queda con esas horas. */
  countedMinutes: number;
  /** Sesiones del mismo día que se quedan con sus horas solapadas (vacío si cuenta entera). */
  overlapsWith: string[];
  /** Coste de lo que cuenta. */
  costCents: number;
  fromSchedule: boolean;
  locked: boolean;
  /** La dio en lugar de su profesor (sustitución de esa clase o turno ese día). */
  substitution: boolean;
}

export interface Settlement {
  teacherId: string;
  teacherName: string;
  month: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
  /** Incluye clases con tarifa propia: el importe no es horas × tarifa. (Opcional en datos antiguos.) */
  customRates?: boolean;
  /** Anticipos de ese mes, que se descuentan de lo que hay que pagarle. */
  advancesCents: number;
  /** Importe menos anticipos. */
  toPayCents: number;
  lines: { label: string; minutes: number; amountCents: number }[];
  status: 'pending' | 'paid';
  paidOn: string | null;
}

export interface SettlementSheet extends Settlement {
  club: { name: string; taxId: string; address: string };
}

export interface ProfitabilityRow {
  teacherId: string;
  teacherName: string;
  groups: string[];
  minutes: number;
  rateCents: number;
  costCents: number;
  incomeCents: number;
  marginCents: number;
  marginPerHourCents: number | null;
  occupied: number;
  capacity: number;
  /** Alumnos de sus grupos ese mes (sin las clases que da como sustituto). */
  students: number;
}

/** Filas del mes y alumnos sin repetir (los que van con varios profesores cuentan en la fila de cada uno). */
export interface ProfitabilityReport {
  items: ProfitabilityRow[];
  students: { total: number; shared: { id: string; name: string }[] };
}

export interface SessionPayload {
  teacherId: string;
  date: string;
  groupId: string | null;
  /** Actividad del club (turno o viernes): queda ligada a ella, como su sesión automática. */
  dutyId: string | null;
  activity: string | null;
  hours: number;
}

const BASE = '/api/admin/payroll';

/** Una clase o turno que el profesor aún no ha dado ese mes, según el horario. */
export interface UpcomingSession {
  date: string;
  label: string;
  minutes: number;
  /** Lo que contará: menos si se pisa con otra el mismo día (lo solapado solo se paga una vez). */
  countedMinutes: number;
  /** La dará sustituyendo a su titular. */
  substitution: boolean;
}

/** Una clase o turno del profesor que ese día dio otro. */
export interface SubstitutedClass {
  date: string;
  /** Clase o turno. */
  label: string;
  substituteName: string;
}

/**
 * Las sesiones del mes, sus festivos y, al mirar un profesor, lo que aún le queda por dar y los días en que le
 * sustituyeron (vacíos si no).
 */
export interface MonthSessions {
  items: Session[];
  upcoming: UpcomingSession[];
  holidays: Holiday[];
  substitutedBy: SubstitutedClass[];
}

export function fetchSessions(month: string, teacherId: string): Promise<MonthSessions> {
  const teacher = teacherId ? `&teacherId=${teacherId}` : '';
  return apiGet<MonthSessions>(`${BASE}/sessions?month=${month}${teacher}`);
}

export async function fetchSettlements(month: string): Promise<Settlement[]> {
  return (await apiGet<{ items: Settlement[] }>(`${BASE}/settlements?month=${month}`)).items;
}

export function fetchSettlementSheet(teacherId: string, month: string): Promise<SettlementSheet> {
  return apiGet(`${BASE}/settlements/${teacherId}/${month}`);
}

export function fetchProfitability(month: string): Promise<ProfitabilityReport> {
  return apiGet<ProfitabilityReport>(`${BASE}/profitability?month=${month}`);
}

export async function recordSession(payload: SessionPayload): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/sessions`, payload)).id;
}

export function updateSession(id: string, teacherId: string, hours: number): Promise<void> {
  return apiSend('PUT', `${BASE}/sessions/${id}`, { teacherId, hours });
}

export function deleteSession(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/sessions/${id}`);
}

export interface Holiday {
  date: string;
  name: string;
}

/** Festivos de una temporada (año en que empieza). */
export async function fetchHolidays(season: number): Promise<Holiday[]> {
  return (await apiGet<{ items: Holiday[] }>(`${BASE}/holidays?season=${season}`)).items;
}

/** Añade un festivo; devuelve cuántas sesiones de ese día quitó. */
export async function addHoliday(input: { date: string; name: string }): Promise<number> {
  return (await apiSend<{ removed: number }>('POST', `${BASE}/holidays`, input)).removed;
}

export function removeHoliday(date: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/holidays/${date}`, {});
}

export interface Substitution {
  id: string;
  date: string;
  /** La clase sustituida, o null si es un turno (encargado del club). */
  groupId: string | null;
  dutyId: string | null;
  /** Nombre de la clase o del turno. */
  groupName: string;
  start: string;
  end: string;
  teacherId: string;
  teacherName: string;
  substituteId: string;
  substituteName: string;
  reason: string | null;
}

export async function fetchSubstitutions(month: string): Promise<Substitution[]> {
  return (await apiGet<{ items: Substitution[] }>(`${BASE}/substitutions?month=${month}`)).items;
}

export async function planSubstitution(input: {
  groupId: string | null;
  dutyId: string | null;
  date: string;
  teacherId: string;
  reason: string | null;
}): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/substitutions`, input)).id;
}

/** Sustituye a un profesor por otro en todas sus clases de esos días (salvo festivos); devuelve cuántas. */
export async function substituteTeacher(input: {
  teacherId: string;
  substituteId: string;
  from: string;
  to: string;
  reason: string | null;
}): Promise<number> {
  return (await apiSend<{ created: number }>('POST', `${BASE}/teacher-substitutions`, input))
    .created;
}

export function cancelSubstitution(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/substitutions/${id}`, {});
}

export interface Duty {
  id: string;
  teacherId: string;
  teacherName: string;
  /** 1 = lunes … 7 = domingo. */
  weekday: number;
  start: string;
  end: string;
  label: string;
  /** Turno normal («Turno hecho») o la actividad de los viernes (asistencia de los viernes de los puntos). */
  kind: 'shift' | 'fridays';
}

export interface DutyPayload {
  teacherId: string;
  weekday: number;
  start: string;
  end: string;
  label: string | null;
  kind: 'shift' | 'fridays';
}

export async function fetchDuties(): Promise<Duty[]> {
  return (await apiGet<{ items: Duty[] }>(`${BASE}/duties`)).items;
}

export async function saveDuty(input: { id: string | null; duty: DutyPayload }): Promise<void> {
  if (input.id === null) await apiSend('POST', `${BASE}/duties`, input.duty);
  else await apiSend('PUT', `${BASE}/duties/${input.id}`, input.duty);
}

export function deleteDuty(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/duties/${id}`, {});
}

/** Cómo queda una liquidación tras pagarla: lo que aún falta y lo que sobró como anticipo del mes siguiente. */
export interface SettlementPaymentResult {
  status: 'paid' | 'partial';
  remainingCents: number;
  advanceCents: number;
}

/** Paga una liquidación por lo que se paga de verdad (menos: a cuenta; más: lo que sobra, al mes siguiente). */
export function paySettlement(input: {
  teacherId: string;
  month: string;
  amount: string;
  method: string;
  date: string;
}): Promise<SettlementPaymentResult> {
  const { teacherId, month, ...body } = input;
  return apiSend<SettlementPaymentResult>(
    'POST',
    `${BASE}/settlements/${teacherId}/${month}/payment`,
    body,
  );
}

/** Paga todas las pendientes del mes por lo que queda de cada una. Devuelve cuántas. */
export async function payAllSettlements(input: {
  month: string;
  method: string;
  date: string;
}): Promise<number> {
  const { month, ...body } = input;
  return (await apiSend<{ paid: number }>('POST', `${BASE}/settlements/${month}/payment`, body))
    .paid;
}

// ---- Ficha del profesor ----------------------------------------------------------------------

interface TeacherMonth {
  month: string;
  minutes: number;
  amountCents: number;
  advancesCents: number;
  toPayCents: number;
  /** `none`: sin horas ni anticipos. */
  status: 'paid' | 'pending' | 'none';
  paidOn: string | null;
  incomeCents: number;
  marginCents: number;
}

export interface TeacherPayment {
  /** Id del anticipo (null en las liquidaciones). */
  id: string | null;
  date: string;
  kind: 'settlement' | 'advance';
  month: string;
  amountCents: number;
  note: string | null;
}

export interface TeacherGroup {
  id: string;
  name: string;
  days: string[];
  start: string;
  end: string;
  classroom: string;
  capacity: number;
  occupancyByDay: Record<string, number>;
  students: number;
}

export interface TeacherReport {
  teacher: { id: string; name: string; rateCents: number; active: boolean };
  season: number;
  months: TeacherMonth[];
  /** Lo que le debemos hoy (positivo) o lo pagado de más (negativo). */
  balanceCents: number;
  payments: TeacherPayment[];
  groups: TeacherGroup[];
  occupancy: { occupied: number; capacity: number };
  students: { id: string; name: string; groups: string[]; weeklyMinutes: number }[];
  substitutions: {
    date: string;
    label: string;
    role: 'gave' | 'received';
    otherName: string;
    reason: string | null;
  }[];
  duties: { weekday: number; start: string; end: string; label: string }[];
}

export function fetchTeacherReport(teacherId: string): Promise<TeacherReport> {
  return apiGet<TeacherReport>(`${BASE}/teachers/${teacherId}/report`);
}

export async function recordAdvance(input: {
  teacherId: string;
  month: string;
  amount: string;
  date: string;
  method: string;
  note: string | null;
}): Promise<string> {
  return (await apiSend<{ id: string }>('POST', `${BASE}/advances`, input)).id;
}

export function deleteAdvance(id: string): Promise<void> {
  return apiSend('DELETE', `${BASE}/advances/${id}`, {});
}

export function changeSettlementPaymentDate(input: {
  teacherId: string;
  month: string;
  date: string;
}): Promise<void> {
  return apiSend('PUT', `${BASE}/settlements/${input.teacherId}/${input.month}/payment`, {
    date: input.date,
  });
}

/** Cómo se paga una clase con tarifa propia a quien la dé. */
export type PayUnit = 'hour' | 'session';

/** Solo superadministración: pone (o quita, con null) la tarifa propia de una clase para quien la dé. */
export function setGroupPay(
  groupId: string,
  pay: { unit: PayUnit; amount: string } | null,
): Promise<void> {
  return apiSend('PUT', `${BASE}/groups/${groupId}/pay`, pay ?? { amount: null });
}
