import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

import { type AuditClass, type AuditPeriod, fetchClasses } from '@/features/audit/api';
import { emptyMessage } from '@/features/audit/sections';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatDate } from '@/features/students/format';
import { GroupAttendanceTable } from '@/pages/panel/classes/GroupAttendanceTable';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { RevertButtons } from './RevertButtons';
import { useRevert } from './useRevert';

const key = (c: AuditClass) => `${c.groupId ?? c.label}|${c.date}`;

/** Quién actuó en la clase, sin repetir. */
const people = (c: AuditClass) => [...new Set(c.actions.map((a) => a.userName))].join(', ');

/** «Pasar lista ×2 · Comentar una clase · 1 nota». */
function summary(c: AuditClass): string {
  const counts = new Map<string, number>();
  for (const a of c.actions) counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  const parts = [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label));
  if (c.notes.length > 0)
    parts.push(`${c.notes.length} ${c.notes.length === 1 ? 'nota' : 'notas'}`);
  return parts.join(' · ');
}

type Column = 'date' | 'label' | 'people' | 'summary';

const COLUMNS: Record<Column, SortColumn<AuditClass>> = {
  date: { label: 'Día', name: 'día', value: (c) => c.date },
  label: { label: 'Clase', name: 'clase', value: (c) => c.label },
  people: { label: 'Quién', name: 'quién', value: people },
  summary: { label: 'Qué pasó', name: 'qué pasó', value: summary },
};

/** La clase desplegada: el cuadro de asistencia del grupo ese mes (su día resaltado), las notas y lo que se hizo. */
function ClassDay({ klass }: { klass: AuditClass }) {
  const revert = useRevert();
  return (
    <div className="flex flex-col gap-4">
      {klass.groupId && (
        <GroupAttendanceTable
          groupId={klass.groupId}
          month={klass.date.slice(0, 7)}
          highlight={klass.date}
        />
      )}
      <section aria-label="Notas" className="border-t border-line-soft pt-3">
        <h3 className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Notas
        </h3>
        {klass.notes.length === 0 ? (
          <p className="text-sm text-ink-muted">Sin notas.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {klass.notes.map((n) => (
              <li key={n.id}>
                {n.studentName && <span className="font-medium">{n.studentName}: </span>}
                {n.text}
                <span className="text-ink-muted"> · {n.author}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Qué se hizo" className="border-t border-line-soft pt-3">
        <h3 className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Qué se hizo
        </h3>
        <ul className="flex flex-col gap-1.5">
          {klass.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-ink-muted">{madridDateTime(a.occurredAt)}</span>
                <span className="font-medium">{a.userName}</span>
                <span>{a.label}</span>
                {a.kind === 'undo' && <Badge tone="warning">Deshacer</Badge>}
                {a.kind === 'restore' && <Badge tone="danger">Vuelta atrás</Badge>}
              </span>
              <RevertButtons action={a} onAsk={revert.ask} />
            </li>
          ))}
        </ul>
      </section>
      {revert.dialog}
    </div>
  );
}

/** Una fila por clase (grupo y día) con lo que el historial registró de ella; al abrirla, todo el día y sus notas. */
export function ClassesHistory({ period }: { period: AuditPeriod }) {
  const [open, setOpen] = useState<string | null>(null);
  const { header, apply } = useTableSort(COLUMNS, { key: 'date', descending: true });
  const classes = useQuery({
    queryKey: ['audit-classes', period],
    queryFn: () => fetchClasses(period),
  });
  if (classes.isPending) return <p className="p-5 text-ink-muted">Cargando clases…</p>;
  if (classes.isError)
    return (
      <div className="p-5">
        <Alert>{apiErrorMessage(classes.error)}</Alert>
      </div>
    );
  const items = classes.data.items;
  if (items.length === 0)
    return (
      <p className="px-5 py-12 text-center text-ink-muted">{emptyMessage('attendance', period)}</p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Clases</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            <th scope="col" className="w-12">
              <span className="sr-only">Detalle</span>
            </th>
            {(Object.keys(COLUMNS) as Column[]).map((k) => (
              <th key={k} scope="col" className="px-4 py-3 font-semibold">
                {header(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apply(items).map((c) => {
            const id = key(c);
            const name = `${c.label} · ${formatDate(c.date)}`;
            return (
              <Fragment key={id}>
                <tr className="border-b border-line-soft">
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      aria-label={`Ver la clase ${name}`}
                      aria-expanded={open === id}
                      onClick={() => setOpen(open === id ? null : id)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      {open === id ? (
                        <ChevronDown aria-hidden size={18} />
                      ) : (
                        <ChevronRight aria-hidden size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">
                    {formatDate(c.date)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{c.label}</td>
                  <td className="px-4 py-2.5">{people(c)}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{summary(c)}</td>
                </tr>
                {open === id && (
                  <tr className="border-b border-line-soft bg-surface-muted/40">
                    <td />
                    <td colSpan={4} className="px-4 py-3">
                      <ClassDay klass={c} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
