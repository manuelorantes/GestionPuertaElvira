import { MessageCircle } from 'lucide-react';
import { useId, useState } from 'react';

import { markReminded, type Charge } from '@/features/billing/api';
import { useBillingMutation } from '@/features/billing/hooks';
import { reminderText, whatsappLink } from '@/features/billing/money';
import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { useToast } from '@/shared/ui/Toast';

export function WhatsAppDialog({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const [text, setText] = useState(reminderText(charge));
  const remind = useBillingMutation(() => markReminded(charge.id));
  const toast = useToast();
  const messageId = useId();

  async function open() {
    window.open(whatsappLink(charge.guardianPhone, text), '_blank', 'noopener');
    await remind.mutateAsync(undefined).then(
      () => {
        toast(`Aviso preparado en WhatsApp para ${charge.guardianName}`);
        onClose();
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="whatsapp-title">
      <div className="flex flex-col gap-3 p-6">
        <h2
          id="whatsapp-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Aviso por WhatsApp
        </h2>
        <p className="text-sm">
          Para <strong>{charge.guardianName}</strong> · {charge.guardianPhone}
        </p>
        <label htmlFor={messageId} className="text-sm font-medium">
          Mensaje
        </label>
        <textarea
          id={messageId}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="resize-y rounded-sm border border-line-strong bg-surface p-3 leading-normal outline-none focus:border-brand"
        />
        {remind.isError && (
          <Alert>
            WhatsApp se ha abierto, pero no se ha podido marcar la cuota como avisada:{' '}
            {apiErrorMessage(remind.error)}
          </Alert>
        )}
        <p className="text-[13px] text-ink-muted">
          Se abrirá WhatsApp con el mensaje escrito. Lo envías tú desde allí.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void open()}
            busy={remind.isPending}
            busyLabel="Abriendo…"
            disabled={!text.trim()}
            className="inline-flex items-center gap-2"
          >
            <MessageCircle aria-hidden size={18} />
            Abrir WhatsApp
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
