import { ArrowLeft, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { currentMonth, formatCents, monthLabel, shiftMonth } from '@/features/billing/money';
import { SeasonMonths } from '@/features/billing/SeasonMonths';
import { classroomLabel } from '@/features/classes/classrooms';
import { WEEKDAYS } from '@/features/classes/schedule';
import {
  changeSettlementPaymentDate,
  deleteAdvance,
  recordAdvance,
  type TeacherGroup,
  type TeacherPayment,
  type TeacherReport,
} from '@/features/payroll/api';
import { usePayrollMutation, useSessions, useTeacherReport } from '@/features/payroll/hooks';
import { hoursLabel } from '@/features/payroll/hours';
import { formatDate, todayIso } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { AsteriskNote } from '@/shared/ui/AsteriskNote';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DateField } from '@/shared/ui/DateField';
import { Dialog } from '@/shared/ui/Dialog';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';
import { StudentLink } from '@/pages/panel/students/StudentLink';

const DUTY_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TH = 'px-4 py-2.5 font-semibold';
const TD = 'px-4 py-2.5';
const ROW_ACTION =
  'flex size-8 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted';

function percent(occupied: number, capacity: number): string {
  return capacity > 0 ? `${Math.round((occupied / capacity) * 100)} %` : '—';
}

function groupOccupancy(group: TeacherGroup): string {
  const occupied = Object.values(group.occupancyByDay).reduce((sum, n) => sum + n, 0);
  return percent(occupied, group.capacity * group.days.length);
}

function daysLabel(days: string[]): string {
  return days.map((d) => WEEKDAYS.find((w) => w.id === d)?.short ?? d).join(', ');
}

/**
 * Ficha de un profesor: saldo (lo que le debemos o lo pagado de más), mes a mes de la temporada, clases dadas, sus
 * clases con su ocupación, alumnos, pagos recibidos (con anticipos), sustituciones y turnos.
 */
export function TeacherPage() {
  const { id = '' } = useParams();
  const report = useTeacherReport(id);
  const [advancing, setAdvancing] = useState(false);

  if (report.isPending) {
    return <main className="px-4 py-8 text-ink-muted md:px-8">Cargando profesor…</main>;
  }
  if (report.isError) {
    return (
      <main className="mx-auto max-w-[1280px] px-4 py-8 md:px-8">
        <BackLink />
        <Alert>{apiErrorMessage(report.error)}</Alert>
      </main>
    );
  }
  const data = report.data;
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <BackLink />
        <SectionHeader
          eyebrow={`Profesor · ${formatCents(data.teacher.rateCents)}/h · ${data.teacher.active ? 'activo' : 'inactivo'}`}
          title={data.teacher.name}
          action={{
            label: 'Anticipo',
            icon: <Plus aria-hidden size={18} />,
            onClick: () => setAdvancing(true),
          }}
        />
      </div>
      <Summary data={data} />
      <MonthsTable data={data} />
      <SessionsSection teacherId={data.teacher.id} />
      <GroupsSection groups={data.groups} />
      <StudentsSection students={data.students} />
      <PaymentsSection teacherId={data.teacher.id} payments={data.payments} />
      <SubstitutionsSection data={data} />
      {advancing && (
        <AdvanceDialog teacherId={data.teacher.id} onClose={() => setAdvancing(false)} />
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      to="/panel/profesores?pestana=equipo"
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-strong"
    >
      <ArrowLeft aria-hidden size={16} />
      Profesores
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card className="overflow-x-auto">
        <h2 className="border-b border-line px-5 py-4 font-display text-xl font-semibold tracking-[0.04em] uppercase">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm text-ink-muted">{children}</p>;
}

function Summary({ data }: { data: TeacherReport }) {
  const thisMonth = data.months.find((m) => m.month === currentMonth());
  const balance = data.balanceCents;
  const cards = [
    {
      label: balance > 0 ? 'Le debemos' : balance < 0 ? 'Pagado de más' : 'Saldo',
      value: balance === 0 ? 'Al día' : formatCents(Math.abs(balance)),
      hint: 'Liquidaciones pendientes hasta hoy menos anticipos',
      tone: balance < 0 ? 'text-danger-fg' : '',
    },
    {
      label: 'Horas este mes',
      value: hoursLabel(thisMonth?.minutes ?? 0),
      hint: 'Imputadas hasta hoy',
      tone: '',
    },
    {
      label: 'Ocupación de sus clases',
      value: percent(data.occupancy.occupied, data.occupancy.capacity),
      hint: `${data.occupancy.occupied} de ${data.occupancy.capacity} plazas, contando cada día`,
      tone: '',
    },
    {
      label: 'Alumnos',
      value: String(data.students.length),
      hint: `En ${data.groups.length} ${data.groups.length === 1 ? 'clase' : 'clases'}`,
      tone: '',
    },
  ];
  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="px-6 py-5">
          <p className="text-[13px] text-ink-muted">{c.label}</p>
          <p className={`font-display text-4xl leading-tight font-bold ${c.tone}`}>{c.value}</p>
          <p className="text-[12px] text-ink-muted">{c.hint}</p>
        </Card>
      ))}
    </div>
  );
}

function MonthsTable({ data }: { data: TeacherReport }) {
  return (
    <Section title="Mes a mes">
      {data.months.length === 0 ? (
        <Empty>Aún no hay meses en esta temporada.</Empty>
      ) : (
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">Mes a mes de {data.teacher.name}</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {[
                'Mes',
                'Horas',
                'Importe',
                'Anticipos',
                'A pagar',
                'Estado',
                'Ingresos',
                'Margen',
              ].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b border-line-soft last:border-b-0">
                <td className={`${TD} font-medium`}>{monthLabel(m.month)}</td>
                <td className={TD}>{hoursLabel(m.minutes)}</td>
                <td className={TD}>{formatCents(m.amountCents)}</td>
                <td className={TD}>
                  {m.advancesCents > 0 ? `−${formatCents(m.advancesCents)}` : '—'}
                </td>
                <td className={`${TD} font-semibold`}>{formatCents(m.toPayCents)}</td>
                <td className={TD}>
                  {m.status === 'paid' ? (
                    <Badge tone="success">Pagada el {formatDate(m.paidOn)}</Badge>
                  ) : m.status === 'pending' ? (
                    <Badge tone={m.month === currentMonth() ? 'neutral' : 'warning'}>
                      {m.month === currentMonth() ? 'En curso' : 'Pendiente'}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={TD}>{formatCents(m.incomeCents)}</td>
                <td className={`${TD} ${m.marginCents < 0 ? 'text-danger-fg' : ''}`}>
                  {formatCents(m.marginCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="px-5 py-3 text-[13px] text-ink-muted">
        Ingresos = cuotas mensuales de sus alumnos repartidas según las horas con cada profesor.
        Margen = ingresos − coste (en el mes en curso, con las horas esperadas).
      </p>
    </Section>
  );
}

function SessionsSection({ teacherId }: { teacherId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const sessions = useSessions(month, teacherId);
  const items = sessions.data ?? [];
  const total = items.reduce((sum, s) => sum + s.minutes, 0);
  return (
    <Section title="Clases dadas">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <SeasonMonths
          month={month}
          selected={month}
          label="Mes de las clases"
          onChange={setMonth}
        />
        <span className="text-sm text-ink-muted">
          {items.length} sesiones · {hoursLabel(total)}
        </span>
      </div>
      {items.length === 0 ? (
        <Empty>Sin sesiones en {monthLabel(month).toLowerCase()}.</Empty>
      ) : (
        <table className="mt-2 w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Clases dadas en {monthLabel(month).toLowerCase()}</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {['Fecha', 'Clase o actividad', 'Horas', 'Coste'].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <td className={TD}>{formatDate(s.date)}</td>
                <td className={TD}>{s.substitution ? `(Sustitución) ${s.label}` : s.label}</td>
                <td className={TD}>{hoursLabel(s.minutes)}</td>
                <td className={TD}>{formatCents(s.costCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function GroupsSection({ groups }: { groups: TeacherGroup[] }) {
  return (
    <Section title="Sus clases">
      {groups.length === 0 ? (
        <Empty>No tiene clases asignadas.</Empty>
      ) : (
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">Clases asignadas</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {['Clase', 'Días', 'Horario', 'Aula', 'Alumnos', 'Ocupación'].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-line-soft last:border-b-0">
                <td className={`${TD} font-medium`}>{g.name}</td>
                <td className={TD}>{daysLabel(g.days)}</td>
                <td className={TD}>
                  {g.start}–{g.end}
                </td>
                <td className={TD}>{classroomLabel(g.classroom)}</td>
                <td className={TD}>
                  {g.students} / {g.capacity}
                  <StudentsByDay group={g} />
                </td>
                <td className={TD}>{groupOccupancy(g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/**
 * Asterisco junto a los alumnos cuando no todos vienen todos los días (horario especial): el total puede pasar de
 * las plazas sin que ningún día esté lleno. Al pincharlo se ven los alumnos de cada día.
 */
function StudentsByDay({ group }: { group: TeacherGroup }) {
  const counts = WEEKDAYS.filter((d) => group.days.includes(d.id)).map((d) => ({
    day: d.long,
    count: group.occupancyByDay[d.id] ?? 0,
  }));
  if (counts.length < 2 || counts.every((c) => c.count === group.students)) return null;
  return (
    <AsteriskNote label={`Alumnos por día de ${group.name}`}>
      {counts.map((c) => (
        <span key={c.day} className="block">
          {c.day} {group.start}: {c.count} / {group.capacity}
        </span>
      ))}
      <span className="mt-1 block text-[12px] text-ink-muted">
        Hay alumnos que solo vienen algún día.
      </span>
    </AsteriskNote>
  );
}

function StudentsSection({ students }: { students: TeacherReport['students'] }) {
  return (
    <Section title={`Alumnos (${students.length})`}>
      {students.length === 0 ? (
        <Empty>No tiene alumnos ahora mismo.</Empty>
      ) : (
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Alumnos</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {['Alumno', 'Clases', 'Horas semanales con él o ella'].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-line-soft last:border-b-0">
                <td className={TD}>
                  <StudentLink id={s.id} className="font-medium hover:text-brand">
                    {s.name}
                  </StudentLink>
                </td>
                <td className={TD}>{s.groups.join(' · ')}</td>
                <td className={TD}>{hoursLabel(s.weeklyMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function PaymentsSection({
  teacherId,
  payments,
}: {
  teacherId: string;
  payments: TeacherPayment[];
}) {
  const [moving, setMoving] = useState<TeacherPayment | null>(null);
  const [removing, setRemoving] = useState<TeacherPayment | null>(null);
  const remove = usePayrollMutation(deleteAdvance);
  const toast = useToast();
  return (
    <Section title="Pagos recibidos">
      {payments.length === 0 ? (
        <Empty>Aún no se le ha pagado nada esta temporada.</Empty>
      ) : (
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Pagos recibidos</caption>
          <thead className="border-b border-line text-xs tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              {['Fecha', 'Concepto', 'Importe'].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr
                key={`${p.kind}-${p.id ?? p.month}`}
                className="border-b border-line-soft last:border-b-0"
              >
                <td className={TD}>{formatDate(p.date)}</td>
                <td className={TD}>
                  {p.kind === 'settlement'
                    ? `Liquidación de ${monthLabel(p.month).toLowerCase()}`
                    : `Anticipo a cuenta de ${monthLabel(p.month).toLowerCase()}`}
                  {p.note && <span className="block text-[12px] text-ink-muted">{p.note}</span>}
                </td>
                <td className={`${TD} font-medium`}>{formatCents(p.amountCents)}</td>
                <td className="px-3 py-2">
                  <span className="flex justify-end">
                    {p.kind === 'settlement' ? (
                      <button
                        type="button"
                        aria-label={`Cambiar la fecha de pago de ${monthLabel(p.month).toLowerCase()}`}
                        onClick={() => setMoving(p)}
                        className={ROW_ACTION}
                      >
                        <CalendarClock aria-hidden size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Quitar el anticipo del ${formatDate(p.date)}`}
                        onClick={() => setRemoving(p)}
                        className={ROW_ACTION}
                      >
                        <Trash2 aria-hidden size={15} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {moving && (
        <PaymentDateDialog teacherId={teacherId} payment={moving} onClose={() => setMoving(null)} />
      )}
      {removing?.id && (
        <ConfirmDialog
          title="Quitar anticipo"
          message={`Se quitará el anticipo de ${formatCents(removing.amountCents)} del ${formatDate(removing.date)}: dejará de descontarse de ${monthLabel(removing.month).toLowerCase()} y de salir en Contabilidad.`}
          confirmLabel="Quitar"
          busy={remove.isPending}
          error={remove.isError ? apiErrorMessage(remove.error) : null}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            void remove.mutateAsync(removing.id ?? '').then(
              () => {
                toast('Anticipo quitado');
                setRemoving(null);
              },
              () => undefined,
            )
          }
        />
      )}
    </Section>
  );
}

function SubstitutionsSection({ data }: { data: TeacherReport }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Sustituciones">
        {data.substitutions.length === 0 ? (
          <Empty>Sin sustituciones esta temporada.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {data.substitutions.map((s, index) => (
              <li key={`${s.date}-${index}`} className="px-5 py-2.5">
                <span className="font-medium">{formatDate(s.date)}</span> · {s.label}:{' '}
                {s.role === 'gave' ? `sustituyó a ${s.otherName}` : `le sustituyó ${s.otherName}`}
                {s.reason && <span className="block text-[12px] text-ink-muted">{s.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Turnos fijos">
        {data.duties.length === 0 ? (
          <Empty>No tiene turnos de encargado.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {data.duties.map((d) => (
              <li key={`${d.weekday}-${d.start}`} className="px-5 py-2.5">
                <span className="font-medium">{DUTY_DAYS[d.weekday - 1]}</span> {d.start}–{d.end} ·{' '}
                {d.label}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** Dinero pagado a cuenta de la liquidación de un mes (o pagado de más, que se descuenta de un mes posterior). */
function AdvanceDialog({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const save = usePayrollMutation(recordAdvance);
  const toast = useToast();
  const year = new Date().getFullYear();
  const months = [-1, 0, 1, 2].map((n) => shiftMonth(currentMonth(), n));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (amount.trim() === '') return;
    void save
      .mutateAsync({
        teacherId,
        month,
        amount: amount.replace(',', '.'),
        date,
        note: note.trim() || null,
      })
      .then(
        () => {
          toast('Anticipo apuntado');
          onClose();
        },
        () => undefined,
      );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="advance-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="advance-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Nuevo anticipo
        </h2>
        {save.isError && <Alert>{apiErrorMessage(save.error)}</Alert>}
        <TextField
          label="Importe (€)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Select
          label="Se descuenta de"
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
          value={month}
          onChange={setMonth}
        />
        <DateField
          label="Pagado el"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <TextField
          label="Nota (opcional)"
          placeholder="Por ejemplo: pago de más en septiembre"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-[13px] text-ink-muted">
          Sale en Contabilidad el día que se paga y se descuenta de lo que haya que pagarle ese mes.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={amount.trim() === ''}
            busy={save.isPending}
            busyLabel="Guardando…"
          >
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PaymentDateDialog({
  teacherId,
  payment,
  onClose,
}: {
  teacherId: string;
  payment: TeacherPayment;
  onClose: () => void;
}) {
  const [date, setDate] = useState(payment.date);
  const change = usePayrollMutation(changeSettlementPaymentDate);
  const toast = useToast();
  const year = new Date().getFullYear();

  function submit(event: FormEvent) {
    event.preventDefault();
    void change.mutateAsync({ teacherId, month: payment.month, date }).then(
      () => {
        toast('Fecha de pago cambiada');
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="payment-date-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="payment-date-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Fecha de pago
        </h2>
        {change.isError && <Alert>{apiErrorMessage(change.error)}</Alert>}
        <p className="text-sm text-ink-soft">
          Liquidación de {monthLabel(payment.month).toLowerCase()} ·{' '}
          {formatCents(payment.amountCents)}
        </p>
        <DateField
          label="Pagada el"
          value={date}
          onChange={setDate}
          fromYear={year - 1}
          toYear={year + 1}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={change.isPending} busyLabel="Guardando…">
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
