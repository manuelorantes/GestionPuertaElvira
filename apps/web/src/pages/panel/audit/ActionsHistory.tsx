import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, LogIn } from 'lucide-react';
import { Fragment, useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type AuditAction, type AuditQuery, fetchActions } from '@/features/audit/api';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

import { ActionDetail } from './ActionDetail';
import { RevertButtons } from './RevertButtons';
import { useRevert } from './useRevert';

type Column = 'when' | 'user' | 'label' | 'affected';

const COLUMNS: Record<Column, SortColumn<AuditAction>> = {
  // El número de orden sigue la fecha y hora y nunca empata: el orden exacto en que pasaron las cosas.
  when: { label: 'Fecha y hora', name: 'fecha y hora', value: (a) => a.seq },
  user: { label: 'Persona', name: 'persona', value: (a) => a.userName },
  label: { label: 'Acción', name: 'acción', value: (a) => a.label },
  affected: { label: 'Afecta a', name: 'afecta a', value: (a) => a.affected.join(', ') || null },
};

/**
 * Las acciones que cumplen `query`, con su detalle, deshacer y volver aquí; `onPeople` recibe quién aparece. La
 * cabecera «Acción» filtra por cualquier acción del historial (las cargadas o no): el filtro lo resuelve el servidor.
 */
export function ActionsHistory({
  query,
  emptyMessage,
  onPeople,
}: {
  query: AuditQuery;
  emptyMessage: string;
  onPeople?: (people: { id: string; name: string }[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const revert = useRevert();
  const { header, apply } = useTableSort(COLUMNS, { key: 'when', descending: true });
  const filtered = { ...query, labels };
  const actions = useInfiniteQuery({
    queryKey: ['audit', filtered],
    queryFn: async ({ pageParam }) => {
      const page = await fetchActions(filtered, pageParam);
      if (pageParam === undefined) onPeople?.(page.people);
      return page;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.items.length >= 50 ? last.items[last.items.length - 1]?.seq : undefined,
    // Al cambiar el filtro sigue la tabla (y su menú abierto) hasta que llega la respuesta.
    placeholderData: keepPreviousData,
  });
  const items = actions.data?.pages.flatMap((page) => page.items) ?? [];
  const headerOf = (key: Column) =>
    key === 'label'
      ? header(key, {
          filter: {
            options: (actions.data?.pages[0]?.labels ?? []).map((l) => ({
              value: l.label,
              label: l.label,
              count: l.count,
            })),
            selected: labels,
            onChange: setLabels,
          },
        })
      : header(key);

  if (actions.isPending) return <p className="p-5 text-ink-muted">Cargando historial…</p>;
  if (actions.isError)
    return (
      <div className="p-5">
        <Alert>{apiErrorMessage(actions.error)}</Alert>
      </div>
    );
  if (items.length === 0 && labels.length === 0)
    return <p className="px-5 py-12 text-center text-ink-muted">{emptyMessage}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-sm">
        <caption className="sr-only">Historial de acciones</caption>
        <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          <tr>
            <th scope="col" className="w-12">
              <span className="sr-only">Detalle</span>
            </th>
            {(Object.keys(COLUMNS) as Column[]).map((key) => (
              <th key={key} scope="col" className="px-4 py-3 font-semibold">
                {headerOf(key)}
              </th>
            ))}
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apply(items).map((a) => (
            <Fragment key={a.id}>
              <tr className="border-b border-line-soft">
                <td className="px-2 py-2.5">
                  {a.changeCount > 0 && (
                    <button
                      type="button"
                      aria-label={`Ver detalle de ${a.label}`}
                      aria-expanded={open === a.id}
                      onClick={() => setOpen(open === a.id ? null : a.id)}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
                    >
                      {open === a.id ? (
                        <ChevronDown aria-hidden size={18} />
                      ) : (
                        <ChevronRight aria-hidden size={18} />
                      )}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">
                  {madridDateTime(a.occurredAt)}
                </td>
                <td className="px-4 py-2.5 font-medium">{a.userName}</td>
                <td className="px-4 py-2.5">
                  <span className="flex flex-wrap items-center gap-2">
                    {a.kind === 'security' && (
                      <LogIn aria-hidden size={16} className="text-ink-muted" />
                    )}
                    {a.label}
                    {a.kind === 'undo' && <Badge tone="warning">Deshacer</Badge>}
                    {a.kind === 'restore' && <Badge tone="danger">Vuelta atrás</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {a.affected.join(', ') || '—'}
                  {a.changeCount > 0 && (
                    <span className="text-ink-muted">
                      {' '}
                      · {a.changeCount} {a.changeCount === 1 ? 'cambio' : 'cambios'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <RevertButtons action={a} onAsk={revert.ask} />
                </td>
              </tr>
              {open === a.id && (
                <tr className="border-b border-line-soft bg-surface-muted/40">
                  <td />
                  <td colSpan={5} className="px-4 py-3">
                    <ActionDetail id={a.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="px-5 py-12 text-center text-ink-muted">
          Ninguna acción de ese tipo.{' '}
          <button
            type="button"
            onClick={() => setLabels([])}
            className="cursor-pointer font-semibold text-brand"
          >
            Ver todas
          </button>
        </p>
      )}
      {actions.hasNextPage && (
        <div className="flex justify-center border-t border-line p-4">
          <Button
            variant="secondary"
            busy={actions.isFetchingNextPage}
            busyLabel="Cargando…"
            onClick={() => void actions.fetchNextPage()}
          >
            Ver más
          </Button>
        </div>
      )}
      {revert.dialog}
    </div>
  );
}
