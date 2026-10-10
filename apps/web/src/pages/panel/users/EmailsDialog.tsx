import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { addUserEmail, type ClubUser, removeUserEmail } from '@/features/users/api';
import { useUserMutation } from '@/features/users/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';
import { useToast } from '@/shared/ui/Toast';

/**
 * Emails adicionales de una cuenta (opcionales): con cualquiera de ellos se entra en la misma cuenta, con la misma
 * contraseña. El principal no se toca aquí.
 */
export function EmailsDialog({ user, onClose }: { user: ClubUser; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const toast = useToast();
  const add = useUserMutation((address: string) => addUserEmail(user.id, address));
  const remove = useUserMutation((address: string) => removeUserEmail(user.id, address));
  const failure = add.error ?? remove.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() === '') return;
    void add.mutateAsync(email.trim()).then(
      () => {
        setEmail('');
        toast('Email añadido');
      },
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="emails-title">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2
          id="emails-title"
          className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
        >
          Emails de {user.fullName}
        </h2>
        <p className="text-sm text-ink-muted">
          Con cualquiera de estos emails se entra en esta misma cuenta, con la misma contraseña. El
          principal es <strong className="text-ink">{user.email}</strong>.
        </p>
        {failure && <Alert>{apiErrorMessage(failure)}</Alert>}
        {user.otherEmails.length > 0 ? (
          <ul aria-label="Emails adicionales" className="flex flex-col divide-y divide-line-soft">
            {user.otherEmails.map((other) => (
              <li key={other} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">{other}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${other}`}
                  disabled={remove.isPending}
                  onClick={() =>
                    void remove.mutateAsync(other).then(
                      () => toast('Email quitado'),
                      () => undefined,
                    )
                  }
                  className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted disabled:opacity-60"
                >
                  <X aria-hidden size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Sin emails adicionales.</p>
        )}
        <div className="flex items-end gap-2">
          <TextField
            label="Añadir email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="secondary" busy={add.isPending} busyLabel="Añadiendo…">
            Añadir
          </Button>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Hecho</Button>
        </div>
      </form>
    </Dialog>
  );
}
