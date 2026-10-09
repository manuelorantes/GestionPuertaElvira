import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import type { ScheduledTask, SlotStatus, TaskSlot } from '@/features/system/api';
import { useScheduledTasks } from '@/features/system/hooks';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { SectionHeader } from '@/shared/ui/SectionHeader';

const STATUS: Record<
  SlotStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  done: { label: 'Hecha', tone: 'success' },
  failed: { label: 'Falló', tone: 'danger' },
  pending: { label: 'Pendiente', tone: 'neutral' },
  missed: { label: 'No se hizo', tone: 'danger' },
};

const MADRID_TIME = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
});

/** «3 h 51 min», «45 min». */
function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** «Cada día a las 23:30» / «Cada 3 días a las 08:17», en hora de Madrid (la del siguiente turno). */
function scheduleLabel(task: ScheduledTask): string {
  const every = /^\S+ \S+ \*\/(\d+)/.exec(task.cron)?.[1];
  const at = MADRID_TIME.format(new Date(task.next));
  return every ? `Cada ${every} días a las ${at}` : `Cada día a las ${at}`;
}

/** «en 15 h 4 min» hasta el siguiente turno. */
function untilLabel(iso: string): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return `en ${duration(minutes)}`;
}

function SlotRow({ slot }: { slot: TaskSlot }) {
  const status = STATUS[slot.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-5 py-2.5 text-sm last:border-b-0">
      <span className="w-36 shrink-0 tabular-nums">{madridDateTime(slot.slot)}</span>
      <Badge tone={status.tone}>{status.label}</Badge>
      <span className="flex-1 text-[13px] text-ink-muted">
        {slot.status === 'pending'
          ? 'Aún puede llegar: GitHub a veces la retrasa'
          : slot.status === 'missed'
            ? 'No se ejecutó'
            : slot.startedAt
              ? `Arrancó a las ${MADRID_TIME.format(new Date(slot.startedAt))}${
                  slot.delayMinutes !== null && slot.delayMinutes > 30
                    ? ` (GitHub la lanzó ${duration(slot.delayMinutes)} tarde)`
                    : ''
                }`
              : ''}
      </span>
      {slot.url && (
        <a
          href={slot.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] text-brand"
        >
          Ver en GitHub
          <ExternalLink aria-hidden size={13} />
        </a>
      )}
    </li>
  );
}

/** El último turno a la vista y, al abrir el historial, los 15 últimos con su estado. */
function SlotHistory({ task }: { task: ScheduledTask }) {
  const [open, setOpen] = useState(false);
  const [latest, ...older] = task.slots;
  return (
    <>
      <ul aria-label={`Último turno de ${task.name}`}>{latest && <SlotRow slot={latest} />}</ul>
      {older.length > 0 && (
        <div className="border-t border-line-soft">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex w-full cursor-pointer items-center gap-1.5 px-5 py-2.5 text-left text-[13px] font-semibold text-brand hover:bg-surface-muted"
          >
            <ChevronDown
              aria-hidden
              size={15}
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
            {open ? 'Ocultar historial' : `Ver historial (${task.slots.length} últimos)`}
          </button>
          {open && (
            <ul aria-label={`Historial de ${task.name}`} className="border-t border-line-soft">
              {older.map((slot) => (
                <SlotRow key={slot.slot} slot={slot} />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function TaskCard({ task }: { task: ScheduledTask }) {
  return (
    <Card className="overflow-hidden">
      <section aria-label={task.name}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
              {task.name}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">{task.description}</p>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-ink-muted">Horario</dt>
            <dd>{scheduleLabel(task)}</dd>
            <dt className="text-ink-muted">Siguiente</dt>
            <dd>
              {madridDateTime(task.next)}{' '}
              <span className="text-ink-muted">({untilLabel(task.next)})</span>
            </dd>
            <dt className="text-ink-muted">Última</dt>
            <dd>
              {task.lastRun
                ? `${madridDateTime(task.lastRun.startedAt)} · ${task.lastRun.outcome === 'success' ? 'bien' : 'con error'}${task.lastRun.manual ? ' · a mano' : ''}`
                : 'Ninguna todavía'}
            </dd>
          </dl>
        </div>
        {task.slots.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-muted">Aún no le ha tocado ningún turno.</p>
        ) : (
          <SlotHistory task={task} />
        )}
      </section>
    </Card>
  );
}

/** Sistema (solo superadministración): cómo van las tareas programadas y cuándo toca la siguiente. */
export function SystemPage() {
  const session = useSession().data;
  const tasks = useScheduledTasks();
  if (session && session.role !== 'superadministrator') return <Navigate to="/panel" replace />;
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <SectionHeader eyebrow="Tareas programadas" title="Sistema" />
      <p className="-mt-2 text-sm text-ink-muted">
        Cada tarea apunta su ejecución al terminar. Si acaba bien es «Hecha», aunque GitHub la lance
        tarde; si no llega en 12 horas (o antes del turno siguiente), «No se hizo». Las horas son de
        Madrid.
      </p>
      {tasks.isPending ? (
        <p className="text-ink-muted">Cargando tareas…</p>
      ) : tasks.isError ? (
        <Alert>{apiErrorMessage(tasks.error)}</Alert>
      ) : (
        tasks.data.map((task) => <TaskCard key={task.id} task={task} />)
      )}
    </main>
  );
}
