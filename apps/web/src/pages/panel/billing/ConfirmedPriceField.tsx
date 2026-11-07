import { useState } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { centsFromText, centsToText, formatCents } from '@/features/billing/money';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { TextField } from '@/shared/ui/TextField';

interface ConfirmedPriceFieldProps {
  /** «Precio de clase especial», «Precio fijado». */
  label: string;
  priceCents: number | null;
  /** Lo que se muestra sin precio («Sin precio especial»). */
  emptyText: string;
  /** Solo superadministración: el resto lo ve sin poder cambiarlo. */
  canEdit: boolean;
  confirmTitle: string;
  /** Qué pasará al guardar el precio nuevo (null: al quitarlo). */
  describe: (cents: number | null) => string;
  onSave: (monthlyPrice: string | null) => Promise<unknown>;
}

/** Un precio mensual que solo se cambia confirmándolo antes, porque recalcula cuotas. */
export function ConfirmedPriceField({
  label,
  priceCents,
  emptyText,
  canEdit,
  confirmTitle,
  describe,
  onSave,
}: ConfirmedPriceFieldProps) {
  const [draft, setDraft] = useState(priceCents === null ? '' : centsToText(priceCents));
  const [pending, setPending] = useState<{ cents: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftCents = centsFromText(draft);
  const shown = priceCents === null ? emptyText : `${formatCents(priceCents)} al mes`;

  if (!canEdit) {
    return (
      <p className="flex justify-between gap-3 text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="font-medium">{shown}</span>
      </p>
    );
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(pending.cents === null ? null : centsToText(pending.cents).replace(',', '.'));
      setPending(null);
      if (pending.cents === null) setDraft('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="text-ink-muted">{label}: </span>
        <span className="font-medium">{shown}</span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label={`${label} (€ al mes)`}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          error={draft.trim() !== '' && draftCents === null ? 'El precio no es válido.' : undefined}
        />
        <Button
          variant="secondary"
          disabled={draftCents === null || draftCents === priceCents}
          onClick={() => setPending({ cents: draftCents })}
        >
          Guardar precio
        </Button>
        {priceCents !== null && (
          <Button variant="ghost" onClick={() => setPending({ cents: null })}>
            Quitar precio
          </Button>
        )}
      </div>
      {pending && (
        <ConfirmDialog
          title={confirmTitle}
          message={describe(pending.cents)}
          confirmLabel={pending.cents === null ? 'Quitar precio' : 'Guardar precio'}
          onConfirm={() => void confirm()}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}
