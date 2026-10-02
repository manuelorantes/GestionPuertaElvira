import { Check, Circle } from 'lucide-react';
import { useNavigate } from 'react-router';

import { useChangePasswordForm } from '@/features/auth/useChangePasswordForm';
import { useLogout } from '@/features/auth/useLogout';
import { useSession } from '@/features/auth/useSession';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { ClubLogo } from '@/shared/ui/ClubLogo';
import { TextField } from '@/shared/ui/TextField';

const RULES_ID = 'password-rules';

export function ChangePasswordPage() {
  const { data: user } = useSession();
  const navigate = useNavigate();
  const logout = useLogout();
  const form = useChangePasswordForm(
    user?.email ?? '',
    () => void navigate('/panel', { replace: true }),
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-4 rounded-md border border-line bg-surface p-8 text-center shadow-card">
        <ClubLogo size={64} />
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-[0.04em] uppercase">
            Elige tu contraseña
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Entraste con una contraseña temporal. Elige una nueva para seguir.
          </p>
        </div>
        <form noValidate onSubmit={form.submit} className="flex w-full flex-col gap-4">
          {form.errorMessage && <Alert>{form.errorMessage}</Alert>}
          <TextField
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            autoFocus
            help="La temporal que te dieron o la que usas ahora."
            value={form.currentPassword}
            onChange={(event) => form.setCurrentPassword(event.target.value)}
            error={form.fieldErrors.currentPassword}
          />
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            describedBy={RULES_ID}
            value={form.newPassword}
            onChange={(event) => form.setNewPassword(event.target.value)}
            error={form.fieldErrors.newPassword}
          />
          <ul
            id={RULES_ID}
            aria-label="Requisitos de la contraseña"
            className="flex flex-col gap-1 text-left text-sm"
          >
            {form.rules.map((rule) => (
              <li
                key={rule.id}
                data-met={String(rule.met)}
                className={`flex items-center gap-2 ${rule.met ? 'text-success-fg' : 'text-ink-muted'}`}
              >
                {rule.met ? <Check aria-hidden size={16} /> : <Circle aria-hidden size={16} />}
                {rule.label}
              </li>
            ))}
          </ul>
          <TextField
            label="Repite la nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => form.setConfirmPassword(event.target.value)}
            error={form.fieldErrors.confirmPassword}
          />
          <Button type="submit" size="lg" fullWidth busy={form.isSubmitting} busyLabel="Guardando…">
            Guardar y entrar
          </Button>
          <Button variant="ghost" fullWidth onClick={() => logout.mutate()}>
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
