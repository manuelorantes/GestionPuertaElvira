import { useState } from 'react';

import type { MissedRollCall } from '@/features/attendance/api';
import { useMissedRollCalls, useSettleMissedRollCall } from '@/features/attendance/hooks';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { formatDate } from '@/features/students/format';
import { Alert } from '@/shared/ui/Alert';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

const ACTION =
  'h-9 cursor-pointer rounded-sm border border-line-strong px-3 text-[13px] font-semibold whitespace-nowrap hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Listas sin pasar: clases apuntadas cuyo plazo acabó sin lista. Se quita la sesión (no se dio, deja de contar
 * horas) o se da por buena (se dio). Solo aparece si hay alguna.
 */
export function MissedRollCalls() {
  const missed = useMissedRollCalls();
  const settle = useSettleMissedRollCall();
  const toast = useToast();
  const [removing, setRemoving] = useState<MissedRollCall | null>(null);
  const items = missed.data ?? [];
  if (items.length === 0) return null;

  function keep(item: MissedRollCall) {
    settle.mutate({ item, given: true }, { onSuccess: () => toast('Clase dada por buena') });
  }

  return (
    <section id="listas-sin-pasar" aria-label="Listas sin pasar">
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-semibold tracking-[0.04em] uppercase">
            Listas sin pasar ({items.length})
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Clases sin lista y actividades del club que su encargado no confirmó (en la de los
            viernes, sin marcar a nadie), con el plazo acabado. Si no se dio, quita la sesión; si se
            dio, dala por buena.
          </p>
        </div>
        {settle.isError && !removing && (
          <div className="px-5 pt-4">
            <Alert>{apiErrorMessage(settle.error)}</Alert>
          </div>
        )}
        <ul>
          {items.map((item) => (
            <li
              key={`${item.groupId ?? item.dutyId}-${item.date}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {formatDate(item.date)} · {item.label}
                </p>
                <p className="text-ink-muted">{item.teacherName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={ACTION}
                  disabled={item.locked || settle.isPending}
                  title={item.locked ? 'La liquidación de ese mes ya está pagada' : undefined}
                  onClick={() => setRemoving(item)}
                  aria-label={`Quitar la sesión del ${formatDate(item.date)} de ${item.label}`}
                >
                  No se dio
                </button>
                <button
                  type="button"
                  className={ACTION}
                  disabled={settle.isPending}
                  onClick={() => keep(item)}
                  aria-label={`Dar por buena la clase del ${formatDate(item.date)} de ${item.label}`}
                >
                  Se dio
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {removing && (
        <ConfirmDialog
          title="Quitar la sesión"
          message={`La clase ${removing.label} del ${formatDate(removing.date)} dejará de contar en las horas de ${removing.teacherName}.`}
          confirmLabel="Quitar sesión"
          busy={settle.isPending}
          error={settle.isError ? apiErrorMessage(settle.error) : null}
          onCancel={() => {
            settle.reset();
            setRemoving(null);
          }}
          onConfirm={() =>
            settle.mutate(
              { item: removing, given: false },
              {
                onSuccess: () => {
                  setRemoving(null);
                  toast('Sesión quitada');
                },
              },
            )
          }
        />
      )}
    </section>
  );
}
