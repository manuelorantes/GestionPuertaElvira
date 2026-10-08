import { useState, type ReactNode } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import { todayIso } from '@/features/students/format';
import type { TeacherClass } from '@/features/teacher-space/api';
import { dayLabel, weekOf } from '@/features/teacher-space/dates';
import { useTeacherClasses } from '@/features/teacher-space/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { Tabs } from '@/shared/ui/Tabs';

import { ClassCard } from './ClassCard';

const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
];

/** Portada de una cuenta de profesorado: sus clases de hoy y de la semana (o el aviso de cuenta sin vincular). */
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
      {user?.teacherId ? (
        <Tabs label="Periodo" tabs={TABS} value={tab} onChange={setTab}>
          {tab === 'hoy' ? <Today /> : <Week />}
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
      render={(items) => {
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
      }}
    />
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
