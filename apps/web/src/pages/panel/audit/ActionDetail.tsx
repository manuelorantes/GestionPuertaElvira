import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';

import { fieldLabel, fieldValue, isEmptyValue, type ValuePart } from '@/features/audit/fields';
import { targetLink } from '@/features/audit/targets';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { fetchAction } from '@/features/audit/api';
import { Alert } from '@/shared/ui/Alert';

const OPERATION = { I: 'Alta', U: 'Cambio', D: 'Baja' } as const;
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

/** El detalle campo a campo de una acción. */
export function ActionDetail({ id }: { id: string }) {
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
