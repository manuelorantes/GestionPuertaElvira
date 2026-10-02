import { X } from 'lucide-react';

import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ClubLogo } from '@/shared/ui/ClubLogo';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/TextField';

import type { SessionUser } from './api';
import { useLoginForm } from './useLoginForm';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onLoggedIn: (user: SessionUser) => void;
}

export function LoginDialog({ open, onClose, onLoggedIn }: LoginDialogProps) {
  const form = useLoginForm(onLoggedIn);

  return (
    <Dialog open={open} onClose={onClose} labelledBy="login-title">
      <div className="flex h-2" aria-hidden>
        <div className="flex-3 bg-brand" />
        <div className="flex-1 bg-ink-strong" />
      </div>
      <div className="relative flex flex-col items-center gap-4 p-8 text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 flex size-10 cursor-pointer items-center justify-center rounded-sm text-ink-soft hover:bg-surface-muted"
        >
          <X aria-hidden size={18} />
        </button>
        <ClubLogo size={80} />
        <div>
          <h2
            id="login-title"
            className="font-display text-[26px] font-bold tracking-[0.04em] uppercase"
          >
            Acceso administración
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Entra con tu email y tu contraseña.</p>
        </div>
        <form noValidate onSubmit={form.submit} className="flex w-full flex-col gap-4">
          {form.errorMessage && <Alert>{form.errorMessage}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            placeholder="nombre@ejemplo.com"
            value={form.email}
            onChange={(event) => form.setEmail(event.target.value)}
            error={form.fieldErrors.email}
          />
          <TextField
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={form.password}
            onChange={(event) => form.setPassword(event.target.value)}
            error={form.fieldErrors.password}
          />
          <Button type="submit" size="lg" fullWidth busy={form.isSubmitting} busyLabel="Entrando…">
            Entrar
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
