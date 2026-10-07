import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  History,
  LogIn,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { fieldLabel, fieldValue } from '@/features/audit/fields';
import { targetLink } from '@/features/audit/targets';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { useSession } from '@/features/auth/useSession';
import {
  fetchAction,
  fetchActions,
  restoreToPoint,
  undoAction,
  type AuditAction,
} from '@/features/audit/api';
import { madridDateTime } from '@/shared/dateTime';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { Select } from '@/shared/ui/Select';
import { useToast } from '@/shared/ui/Toast';

const OPERATION = { I: 'Alta', U: 'Cambio', D: 'Baja' } as const;
const ICON_BUTTON =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-surface-muted';

const when = madridDateTime;

function ActionDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ['audit-action', id], queryFn: () => fetchAction(id) });
  if (detail.isPending) return <p className="text-sm text-ink-muted">Cargando detalle…</p>;
  if (detail.isError) return <Alert>{apiErrorMessage(detail.error)}</Alert>;
  if (detail.data.changes.length === 0)
    return <p className="text-sm text-ink-muted">Esta acción no cambió datos.</p>;

  return (
    <div className="flex flex-col gap-3">
      {detail.data.changes.map((change, index) => (
        <div
          key={`${change.table}-${index}`}
          className="rounded-sm border border-line-soft bg-surface p-3"
        >
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">
              {OPERATION[change.operation]} · {change.tableLabel}
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
            {change.fields.map((f) => (
              <Fragment key={f.field}>
                <dt className="text-ink-muted">{fieldLabel(f.field)}</dt>
                <dd className="break-all">
                  {change.operation === 'U' && (
                    <span className="text-ink-muted line-through">
                      {fieldValue(f.field, f.before)}
                    </span>
                  )}
                  {change.operation === 'U' && ' → '}
                  {change.operation === 'D'
                    ? fieldValue(f.field, f.before)
                    : fieldValue(f.field, f.after)}
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

export function AuditPage() {
  const { data: user } = useSession();
  if (user && user.role !== 'superadministrator') return <Navigate to="/panel" replace />;

  return <AuditHistory />;
}

function AuditHistory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = searchParams.get('persona') ?? '';
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const toast = useToast();
  const refresh = useRefreshClubData();
  const actions = useInfiniteQuery({
    queryKey: ['audit', userId],
    queryFn: ({ pageParam }) => fetchActions(userId, pageParam),
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
  const people = actions.data?.pages[0]?.people ?? [];

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

  function renderTable() {
    if (actions.isPending) return <p className="p-5 text-ink-muted">Cargando historial…</p>;
    if (actions.isError)
      return (
        <div className="p-5">
          <Alert>{apiErrorMessage(actions.error)}</Alert>
        </div>
      );
    if (items.length === 0)
      return (
        <p className="px-5 py-12 text-center text-ink-muted">
          Todavía no hay acciones registradas.
        </p>
      );
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <caption className="sr-only">Historial de acciones</caption>
          <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <tr>
              <th scope="col" className="w-12">
                <span className="sr-only">Detalle</span>
              </th>
              {['Fecha y hora', 'Persona', 'Acción', 'Afecta a'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
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
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader eyebrow="Quién ha hecho qué, y vuelta atrás" title="Historial" />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <Select
              label="Persona"
              value={userId}
              onChange={(id) => setSearchParams(id ? { persona: id } : {}, { replace: true })}
              options={[
                { value: '', label: 'Todas' },
                ...people.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <p className="flex flex-1 items-center gap-2 text-[13px] text-ink-muted">
            <History aria-hidden size={16} />
            Cada acción guarda cómo estaban los datos antes y después. Deshacer y volver atrás
            también quedan registrados.
          </p>
        </div>
        {renderTable()}
      </Card>
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
    </main>
  );
}
