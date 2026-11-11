import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import { todayIso } from '@/features/students/format';
import type { TeacherClass } from '@/features/teacher-space/api';
import { currentMonth, monthLabel, shiftMonth } from '@/features/billing/money';
import { addDays, dayLabel, weekOf } from '@/features/teacher-space/dates';
import { useOverdueRollCalls, useTeacherClasses } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { MonthNav } from '@/shared/ui/MonthNav';
import { Tabs } from '@/shared/ui/Tabs';

import { ClassCard } from './ClassCard';

const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'pasadas', label: 'Pasadas' },
];

/**
 * Portada de una cuenta de profesorado: sus clases de hoy, de la semana y las pasadas, mes a mes, para ver o cambiar su
 * lista (o el aviso de cuenta sin vincular).
 */
export function TeacherHomePage() {
  const { data: user } = useSession();
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const [tab, setTab] = useState('hoy');
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
      <div>
        <p className="text-sm text-ink-muted">
          {dayLabel(todayIso())} · Hola, {firstName}
        </p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          Mis clases
        </h1>
      </div>
      {user?.teacherId && <OverdueRollCalls />}
      {user?.teacherId ? (
        <Tabs label="Periodo" tabs={TABS} value={tab} onChange={setTab}>
          {tab === 'hoy' ? <Today /> : tab === 'semana' ? <Week /> : <Past />}
        </Tabs>
      ) : (
        <Card className="px-5 py-6">
          <p className="font-semibold">Tu cuenta aún no está vinculada a ningún profesor.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Pide a administración que la vincule para ver tus clases, tus alumnos y tus pagos.
          </p>
        </Card>
      )}
    </main>
  );
}

/**
 * Aviso en rojo de las clases cuyo plazo para pasar lista acabó (el final del día siguiente) sin pasarla: cada una lleva
 * a su lista para pasarla tarde. Las de hoy y ayer no salen: aún están en plazo.
 */
function OverdueRollCalls() {
  const overdue = useOverdueRollCalls();
  const items = overdue.data ?? [];
  if (items.length === 0) return null;
  return (
    <Alert>
      <p className="font-semibold">
        {items.length === 1
          ? 'Tienes 1 clase sin pasar lista'
          : `Tienes ${items.length} clases sin pasar lista`}
      </p>
      <ul aria-label="Clases sin pasar lista" className="mt-1.5 flex flex-col">
        {items.map((item) => (
          <li key={`${item.groupId}-${item.date}`}>
            <Link
              to={`/panel/lista/${item.groupId}/${item.date}`}
              aria-label={`Pasar lista de ${item.label} del ${dayLabel(item.date)}`}
              className="flex min-h-11 items-center gap-2 font-normal text-danger-fg underline-offset-2 hover:underline"
            >
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{dayLabel(item.date)}</span> · {item.label} ·{' '}
                {item.start}–{item.end}
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function Today() {
  const today = todayIso();
  const classes = useTeacherClasses(today, today);
  return (
    <Agenda
      query={classes}
      empty="Hoy no tienes clases."
      render={(items) => (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ClassCard key={`${item.date}-${item.groupId ?? item.dutyId}`} item={item} />
          ))}
        </div>
      )}
    />
  );
}

function Week() {
  const { from, to } = weekOf();
  const classes = useTeacherClasses(from, to);
  return (
    <Agenda
      query={classes}
      empty="Esta semana no tienes clases."
      render={(items) => <ByDay items={items} />}
    />
  );
}

/** Las clases de antes de hoy, mes a mes y de la más reciente a la más antigua, para ver o cambiar su lista. */
function Past() {
  const [month, setMonth] = useState(currentMonth());
  const yesterday = addDays(todayIso(), -1);
  const from = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const to = last < yesterday ? last : yesterday;
  return (
    <div className="flex flex-col gap-4">
      <MonthNav
        label={monthLabel(month)}
        onPrevious={() => setMonth(shiftMonth(month, -1))}
        onNext={() => month < currentMonth() && setMonth(shiftMonth(month, 1))}
      />
      {from > to ? (
        <p className="py-6 text-center text-ink-muted">Este mes aún no has dado clases.</p>
      ) : (
        <PastMonth from={from} to={to} />
      )}
    </div>
  );
}

function PastMonth({ from, to }: { from: string; to: string }) {
  const classes = useTeacherClasses(from, to);
  return (
    <Agenda
      query={classes}
      empty="Ese mes no diste clases."
      render={(items) => {
        const past = items
          .filter((i) => i.groupId !== null)
          .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
        return past.length === 0 ? (
          <p className="py-6 text-center text-ink-muted">Ese mes no diste clases.</p>
        ) : (
          <ByDay items={past} />
        );
      }}
    />
  );
}

function ByDay({ items }: { items: TeacherClass[] }) {
  const days = [...new Set(items.map((i) => i.date))];
  return (
    <div className="flex flex-col gap-5">
      {days.map((date) => (
        <section key={date} aria-label={dayLabel(date)}>
          <h2 className="mb-2 text-sm font-semibold tracking-[0.06em] text-ink-muted uppercase">
            {dayLabel(date)}
          </h2>
          <div className="flex flex-col gap-3">
            {items
              .filter((i) => i.date === date)
              .map((item) => (
                <ClassCard key={`${item.date}-${item.groupId ?? item.dutyId}`} item={item} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Agenda({
  query,
  empty,
  render,
}: {
  query: ReturnType<typeof useTeacherClasses>;
  empty: string;
  render: (items: TeacherClass[]) => ReactNode;
}) {
  if (query.isPending) return <p className="text-ink-muted">Cargando clases…</p>;
  if (query.isError) return <Alert>{apiErrorMessage(query.error)}</Alert>;
  if (query.data.length === 0) return <p className="py-6 text-center text-ink-muted">{empty}</p>;
  return <>{render(query.data)}</>;
}
