import { RotateCcw, Undo2 } from 'lucide-react';

import type { AuditAction } from '@/features/audit/api';

import type { Revert } from './useRevert';

const ICON_BUTTON =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-surface-muted';

/** «Deshacer» (si se puede) y «Volver aquí» de una acción. */
export function RevertButtons({
  action,
  onAsk,
}: {
  action: AuditAction;
  onAsk: (r: Revert) => void;
}) {
  return (
    <span className="flex justify-end gap-2">
      {action.undoable && (
        <button
          type="button"
          aria-label={`Deshacer ${action.label}`}
          title="Deshacer solo esta acción"
          onClick={() => onAsk({ type: 'undo', action })}
          className={ICON_BUTTON}
        >
          <Undo2 aria-hidden size={16} />
          Deshacer
        </button>
      )}
      {action.kind !== 'security' && (
        <button
          type="button"
          aria-label={`Volver a este punto: ${action.label}`}
          title="Dejar todo como estaba justo después de esta acción"
          onClick={() => onAsk({ type: 'restore', action })}
          className={ICON_BUTTON}
        >
          <RotateCcw aria-hidden size={16} />
          Volver aquí
        </button>
      )}
    </span>
  );
}
