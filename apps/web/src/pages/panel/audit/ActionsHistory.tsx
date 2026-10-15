import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ChevronRight, LogIn, RotateCcw, Undo2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';

import { fieldLabel, fieldValue, isEmptyValue, type ValuePart } from '@/features/audit/fields';
import { targetLink } from '@/features/audit/targets';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import {
  type AuditAction,
  type AuditQuery,
  fetchAction,
  fetchActions,
  restoreToPoint,
  undoAction,
} from '@/features/audit/api';
import { madridDateTime } from '@/shared/dateTime';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';
import { type SortColumn, useTableSort } from '@/shared/ui/useTableSort';

const OPERATION = { I: 'Alta', U: 'Cambio', D: 'Baja' } as const;
const ICON_BUTTON =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-surface-muted';

const when = madridDateTime;

type Column = 'when' | 'user' | 'label' | 'affected';

const COLUMNS: Record<Column, SortColumn<AuditAction>> = {
  // El número de orden sigue la fecha y hora y nunca empata: el orden exacto en que pasaron las cosas.
  when: { label: 'Fecha y hora', name: 'fecha y hora', value: (a) => a.seq },
  user: { label: 'Persona', name: 'persona', value: (a) => a.userName },
  label: { label: 'Acción', name: 'acción', value: (a) => a.label },
  affected: { label: 'Afecta a', name: 'afecta a', value: (a) => a.affected.join(', ') || null },
};

/** Un valor del detalle: sus trozos, con enlace los que son un registro de la aplicación. */
function Value({ parts, muted = false }: { parts: ValuePart[]; muted?: boolean }) {
  return (
    <span className={muted ? 'text-ink-muted line-through' : ''}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ', '}
          {part.to ? (
            <Link to={part.to} className="font-medium">
              {part.text}
            </Link>
          ) : (
            part.text
          )}
        </Fragment>
      ))}
    </span>
  );
}

function ActionDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ['audit-action', id], queryFn: () => fetchAction(id) });
  if (detail.isPending) return <p className="text-sm text-ink-muted">Cargando detalle…</p>;
  if (detail.isError) return <Alert>{apiErrorMessage(detail.error)}</Alert>;
  if (detail.data.changes.length === 0)
    return <p className="text-sm text-ink-muted">Esta acción no cambió datos.</p>;
  const { references } = detail.data;

  return (
    <div className="flex flex-col gap-3">
      {detail.data.changes.map((change, index) => (
        <div
          key={`${change.table}-${index}`}
          className="rounded-sm border border-line-soft bg-surface p-3"
        >
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px]">
              <span className="font-semibold">
                {OPERATION[change.operation]} · {change.tableLabel}
              </span>
              {change.title && <span className="text-ink-soft"> · {change.title}</span>}
            </p>
            {change.target && (
              <Link
                to={targetLink(change.target).to}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink no-underline hover:bg-surface-muted"
              >
                {targetLink(change.target).label}
                <ArrowRight aria-hidden size={14} />
              </Link>
            )}
          </div>
          <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-1 text-[13px]">
            {change.fields
              // En altas y bajas solo se enseña lo que tiene algo; en cambios, todo lo que cambió.
              .filter(
                (f) =>
                  change.operation === 'U' ||
                  !isEmptyValue(change.operation === 'D' ? f.before : f.after),
              )
              .map((f) => (
                <Fragment key={f.field}>
                  <dt className="text-ink-muted">{fieldLabel(f.field, change.table)}</dt>
                  <dd className="break-words">
                    {change.operation === 'U' && (
                      <>
                        <Value
                          parts={fieldValue(f.field, f.before, change.table, references)}
                          muted
                        />
                        {' → '}
                      </>
                    )}
                    <Value
                      parts={fieldValue(
                        f.field,
                        change.operation === 'D' ? f.before : f.after,
                        change.table,
                        references,
                      )}
                    />
                  </dd>
                </Fragment>
              ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

type Pending = { type: 'undo' | 'restore'; action: AuditAction } | null;

/** Las acciones que cumplen `query`, con su detalle, deshacer y volver aquí; `onPeople` recibe quién aparece. */
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
  const [pending, setPending] = useState<Pending>(null);
  const toast = useToast();
  const refresh = useRefreshClubData();
  const { header, apply } = useTableSort(COLUMNS, { key: 'when', descending: true });
  const actions = useInfiniteQuery({
    queryKey: ['audit', query],
    queryFn: async ({ pageParam }) => {
      const page = await fetchActions(query, pageParam);
      if (pageParam === undefined) onPeople?.(page.people);
      return page;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) =>
      last.items.length >= 50 ? last.items[last.items.length - 1]?.seq : undefined,
  });
  const revert = useMutation({
    mutationFn: (p: NonNullable<Pending>) =>
      p.type === 'undo' ? undoAction(p.action.id).then(() => 0) : restoreToPoint(p.action.id),
    onSuccess: refresh,
  });
  const items = actions.data?.pages.flatMap((page) => page.items) ?? [];

  function confirm() {
    if (!pending) return;
    void revert.mutateAsync(pending).then(
      (reverted) => {
        toast(
          pending.type === 'undo'
            ? 'Acción deshecha'
            : `Vuelta atrás hecha: ${reverted} cambios deshechos`,
        );
        setPending(null);
      },
      () => undefined,
    );
  }

  if (actions.isPending) return <p className="p-5 text-ink-muted">Cargando historial…</p>;
  if (actions.isError)
    return (
      <div className="p-5">
        <Alert>{apiErrorMessage(actions.error)}</Alert>
      </div>
    );
  if (items.length === 0)
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
                {header(key)}
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
                  {when(a.occurredAt)}
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
                  <span className="flex justify-end gap-2">
                    {a.undoable && (
                      <button
                        type="button"
                        aria-label={`Deshacer ${a.label}`}
                        title="Deshacer solo esta acción"
                        onClick={() => setPending({ type: 'undo', action: a })}
                        className={ICON_BUTTON}
                      >
                        <Undo2 aria-hidden size={16} />
                        Deshacer
                      </button>
                    )}
                    {a.kind !== 'security' && (
                      <button
                        type="button"
                        aria-label={`Volver a este punto: ${a.label}`}
                        title="Dejar todo como estaba justo después de esta acción"
                        onClick={() => setPending({ type: 'restore', action: a })}
                        className={ICON_BUTTON}
                      >
                        <RotateCcw aria-hidden size={16} />
                        Volver aquí
                      </button>
                    )}
                  </span>
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
      {pending && (
        <ConfirmDialog
          title={
            pending.type === 'undo'
              ? `¿Deshacer «${pending.action.label}»?`
              : '¿Volver a este punto?'
          }
          message={
            pending.type === 'undo'
              ? `Se deshará solo esta acción de ${pending.action.userName} (${when(pending.action.occurredAt)}), si nada posterior depende de ella.`
              : `Todo el club volverá a como estaba justo después de «${pending.action.label}» (${pending.action.userName}, ${when(pending.action.occurredAt)}). Se deshacen todas las acciones posteriores de todas las personas. La vuelta atrás quedará registrada y se podrá deshacer.`
          }
          confirmLabel={pending.type === 'undo' ? 'Deshacer' : 'Volver a este punto'}
          busy={revert.isPending}
          error={revert.isError ? apiErrorMessage(revert.error) : null}
          onCancel={() => {
            revert.reset();
            setPending(null);
          }}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
