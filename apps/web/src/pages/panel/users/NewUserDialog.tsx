import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { ROLE_LABEL, type Role } from '@/features/auth/api';
import { createUser } from '@/features/users/api';
import { useUserMutation } from '@/features/users/hooks';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';

import { TeacherLinkSelect } from './TeacherLinkSelect';

const ROLES = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export function NewUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (fullName: string, temporaryPassword: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('administrator');
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const create = useUserMutation(createUser);
  const ready = email.trim() !== '' && fullName.trim() !== '';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const input = {
      email: email.trim(),
      fullName: fullName.trim(),
      role,
      ...(role === 'teacher' ? { teacherId } : {}),
    };
    void create.mutateAsync(input).then(
      (password) => onCreated(fullName.trim(), password),
      () => undefined,
    );
  }

  return (
    <Dialog open onClose={onClose} labelledBy="new-user-title">
      <form noValidate onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2
            id="new-user-title"
            className="font-display text-2xl font-bold tracking-[0.04em] uppercase"
          >
            Nueva cuenta
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-9 cursor-pointer items-center justify-center rounded-sm hover:bg-surface-muted"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {create.isError && <Alert>{apiErrorMessage(create.error)}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Nombre"
            help="Se verá en el panel y en el historial"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Select
            label="Rol"
            options={ROLES}
            value={role}
            onChange={(value) => setRole(value as Role)}
          />
          {role === 'teacher' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Profesor
              <TeacherLinkSelect label="Profesor" value={teacherId} onChange={setTeacherId} />
              <span className="text-[13px] font-normal text-ink-muted">
                Verá solo sus clases, sus alumnos y sus pagos
              </span>
            </label>
          )}
          <p className="text-[13px] text-ink-muted">
            Se creará con una contraseña temporal que verás una sola vez; tendrá que cambiarla al
            entrar.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!ready} busy={create.isPending} busyLabel="Creando…">
            Crear cuenta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
