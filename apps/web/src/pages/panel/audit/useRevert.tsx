import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { type AuditAction, restoreToPoint, undoAction } from '@/features/audit/api';
import { madridDateTime } from '@/shared/dateTime';
import { useRefreshClubData } from '@/shared/useRefreshClubData';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { useToast } from '@/shared/ui/Toast';

export type Revert = { type: 'undo' | 'restore'; action: AuditAction };

/** Deshacer una acción o volver a su punto, con confirmación: `ask` pide una y `dialog` es el diálogo abierto. */
export function useRevert(): { ask: (revert: Revert) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<Revert | null>(null);
  const toast = useToast();
  const refresh = useRefreshClubData();
  const revert = useMutation({
    mutationFn: (p: Revert) =>
      p.type === 'undo' ? undoAction(p.action.id).then(() => 0) : restoreToPoint(p.action.id),
    onSuccess: refresh,
  });

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

  const dialog = pending && (
    <ConfirmDialog
      title={
        pending.type === 'undo' ? `¿Deshacer «${pending.action.label}»?` : '¿Volver a este punto?'
      }
      message={
        pending.type === 'undo'
          ? `Se deshará solo esta acción de ${pending.action.userName} (${madridDateTime(pending.action.occurredAt)}), si nada posterior depende de ella.`
          : `Todo el club volverá a como estaba justo después de «${pending.action.label}» (${pending.action.userName}, ${madridDateTime(pending.action.occurredAt)}). Se deshacen todas las acciones posteriores de todas las personas. La vuelta atrás quedará registrada y se podrá deshacer.`
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
  );
  return { ask: setPending, dialog };
}
