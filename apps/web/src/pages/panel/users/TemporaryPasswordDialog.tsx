import { Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';

/** Contraseña temporal recién generada: se muestra solo ahora para entregarla en persona. */
export function TemporaryPasswordDialog({
  user,
  password,
  onClose,
}: {
  user: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog open onClose={onClose} labelledBy="temporary-password-title">
      <div className="border-b border-line px-6 py-5">
        <h2
          id="temporary-password-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Contraseña temporal
        </h2>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="text-sm">
          Contraseña temporal de <strong>{user}</strong>. Solo se muestra ahora: entrégala en
          persona. Tendrá que cambiarla al entrar.
        </p>
        <div className="flex items-center gap-2">
          <code
            aria-label="Contraseña temporal"
            className="flex-1 rounded-sm border border-line-strong bg-surface-muted px-3 py-2.5 font-mono text-base break-all"
          >
            {password}
          </code>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(password).then(
                () => setCopied(true),
                () => undefined,
              )
            }
          >
            <Copy aria-hidden size={16} />
            {copied ? 'Copiada' : 'Copiar'}
          </Button>
        </div>
      </div>
      <div className="flex justify-end border-t border-line px-6 py-4">
        <Button onClick={onClose}>Hecho</Button>
      </div>
    </Dialog>
  );
}
