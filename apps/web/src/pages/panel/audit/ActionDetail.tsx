import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';

import { fieldLabel, fieldValue, isEmptyValue, type ValuePart } from '@/features/audit/fields';
import { targetLink } from '@/features/audit/targets';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type AuditDetail, fetchAction } from '@/features/audit/api';
import { Alert } from '@/shared/ui/Alert';

import { StudentGroups } from './StudentGroups';

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

type Change = AuditDetail['changes'][number];

/** El botón «Ir a…» de un cambio, a la derecha. */
function TargetLink({ target }: { target: NonNullable<Change['target']> }) {
  const link = targetLink(target);
  return (
    <Link
      to={link.to}
      className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink no-underline hover:bg-surface-muted"
    >
      {link.label}
      <ArrowRight aria-hidden size={14} />
    </Link>
  );
}

/** El cobro que una acción registró (o quitó, al deshacer), si lo hay. */
function paymentOf(changes: Change[]): Change | undefined {
  return changes.find((c) => c.table === 'billing_payment' && c.operation !== 'U');
}

/**
 * Un cobro se resume en lo que interesa (alumno, pago y concepto) en vez de campo a campo: el recibo, la numeración
 * y las cuotas que cubre se quedan en los enlaces de la derecha.
 */
function PaymentSummary({
  payment,
  changes,
  references,
}: {
  payment: Change;
  changes: Change[];
  references: AuditDetail['references'];
}) {
  const value = (field: string) =>
    payment.fields.find((f) => f.field === field)?.[payment.operation === 'D' ? 'before' : 'after'];
  const parts = (field: string) => fieldValue(field, value(field), payment.table, references);
  const total = fieldValue('total_cents', value('total_cents'))[0]?.text ?? '—';
  const method = fieldValue('method', value('method'), payment.table)[0]?.text ?? '—';
  const targets = changes
    .map((c) => c.target)
    .filter((t): t is NonNullable<Change['target']> => t !== null)
    .filter((t, i, all) => all.findIndex((o) => targetLink(o).to === targetLink(t).to) === i);
  const title = payment.operation === 'D' ? 'Cobro quitado' : 'Cobro registrado';
  const titleId = `payment-summary-${payment.key.id as string}`;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-line-soft bg-surface p-3"
    >
      <div className="flex flex-col gap-1.5">
        <p id={titleId} className="text-[13px] font-semibold">
          {title}
        </p>
        <dl className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-ink-muted">Alumno</dt>
          <dd>
            <Value parts={parts('student_id')} />
          </dd>
          <dt className="text-ink-muted">Pago</dt>
          <dd>
            {total} · {method}
          </dd>
          <dt className="text-ink-muted">Concepto</dt>
          <dd className="break-words">
            <Value parts={parts('concept')} />
          </dd>
        </dl>
      </div>
      {targets.length > 0 && (
        <div className="flex flex-col items-end gap-2">
          {targets.map((t) => (
            <TargetLink key={targetLink(t).to} target={t} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * El detalle de una acción: el resumen de un cobro o, para lo demás, campo a campo; si tocó inscripciones, antes van
 * todos los grupos de cada alumno antes y después.
 */
/** Un registro tocado por una acción: qué fue (alta, cambio o baja), cómo se llama y cada campo con su antes y después. */
export function ChangeCard({
  change,
  references,
  showTarget = true,
}: {
  change: Change;
  references: AuditDetail['references'];
  /** Sin el botón «Ir a…» (p. ej. en la propia ficha a la que llevaría). */
  showTarget?: boolean;
}) {
  return (
    <div className="rounded-sm border border-line-soft bg-surface p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px]">
          <span className="font-semibold">
            {OPERATION[change.operation]} · {change.tableLabel}
          </span>
          {change.title && <span className="text-ink-soft"> · {change.title}</span>}
        </p>
        {showTarget && change.target && <TargetLink target={change.target} />}
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
                    <Value parts={fieldValue(f.field, f.before, change.table, references)} muted />
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
  );
}

export function ActionDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ['audit-action', id], queryFn: () => fetchAction(id) });
  if (detail.isPending) return <p className="text-sm text-ink-muted">Cargando detalle…</p>;
  if (detail.isError) return <Alert>{apiErrorMessage(detail.error)}</Alert>;
  if (detail.data.changes.length === 0)
    return <p className="text-sm text-ink-muted">Esta acción no cambió datos.</p>;
  const { references, changes } = detail.data;
  const payment = paymentOf(changes);
  if (payment)
    return <PaymentSummary payment={payment} changes={changes} references={references} />;

  return (
    <div className="flex flex-col gap-3">
      <StudentGroups students={detail.data.studentGroups} />
      {detail.data.changes.map((change, index) => (
        <ChangeCard key={`${change.table}-${index}`} change={change} references={references} />
      ))}
    </div>
  );
}
