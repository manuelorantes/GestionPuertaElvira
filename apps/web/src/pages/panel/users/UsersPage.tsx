import { KeyRound, Power, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router';

import { apiErrorMessage } from '@/features/auth/apiErrorMessage';
import { ROLE_LABEL, type Role } from '@/features/auth/api';
import { useSession } from '@/features/auth/useSession';
import { changeRole, type ClubUser, resetPassword, setEnabled } from '@/features/users/api';
import { useUserMutation, useUsers } from '@/features/users/hooks';
import { madridDateTime } from '@/shared/dateTime';
import { Alert } from '@/shared/ui/Alert';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { ToggleButton } from '@/shared/ui/ToggleButton';
import { useToast } from '@/shared/ui/Toast';

import { NewUserDialog } from './NewUserDialog';
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog';

type StatusFilter = 'active' | 'disabled' | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'disabled', label: 'Desactivados' },
  { id: 'all', label: 'Todos' },
];

const ROLES = Object.keys(ROLE_LABEL) as Role[];

const ROW_ACTION =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-[13px] font-semibold whitespace-nowrap hover:bg-surface-muted';

type Pending = { type: 'reset'; user: ClubUser } | { type: 'toggle'; user: ClubUser } | null;

/** Cuentas de usuario (solo superadministración): última conexión, rol, contraseña y desactivación. */
export function UsersPage() {
  const session = useSession().data;
  const users = useUsers();
  const toast = useToast();
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [temporary, setTemporary] = useState<{ user: string; password: string } | null>(null);
  const reset = useUserMutation(resetPassword);
  const toggle = useUserMutation((u: ClubUser) => setEnabled(u.id, u.status === 'disabled'));
  const role = useUserMutation(({ id, value }: { id: string; value: Role }) =>
    changeRole(id, value),
  );

  if (session && session.role !== 'superadministrator') return <Navigate to="/panel" replace />;

  const all = users.data ?? [];
  const shown = filter === 'all' ? all : all.filter((u) => u.status === filter);
  const activeCount = all.filter((u) => u.status === 'active').length;

  function confirm() {
    if (pending?.type === 'reset') {
      const user = pending.user;
      void reset.mutateAsync(user.id).then(
        (password) => {
          setPending(null);
          setTemporary({ user: user.fullName, password });
        },
        () => undefined,
      );
    } else if (pending?.type === 'toggle') {
      const user = pending.user;
      void toggle.mutateAsync(user).then(
        () => {
          setPending(null);
          toast(user.status === 'active' ? 'Cuenta desactivada' : 'Cuenta reactivada');
        },
        () => undefined,
      );
    }
  }

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <SectionHeader
        eyebrow={`${activeCount} ${activeCount === 1 ? 'cuenta activa' : 'cuentas activas'}`}
        title="Usuarios"
        action={{
          label: 'Nueva cuenta',
          icon: <UserPlus aria-hidden size={18} />,
          onClick: () => setCreating(true),
        }}
      />
      <Card className="overflow-hidden">
        <div
          role="group"
          aria-label="Estado"
          className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3"
        >
          {FILTERS.map((f) => (
            <ToggleButton
              key={f.id}
              tone="ink"
              pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="h-9 rounded-full font-medium"
            >
              {f.label}
            </ToggleButton>
          ))}
        </div>
        {role.isError && (
          <div className="px-5 pt-4">
            <Alert>{apiErrorMessage(role.error)}</Alert>
          </div>
        )}
        {users.isPending ? (
          <p className="p-5 text-ink-muted">Cargando cuentas…</p>
        ) : users.isError ? (
          <div className="p-5">
            <Alert>{apiErrorMessage(users.error)}</Alert>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-ink-muted">No hay cuentas con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">Cuentas de usuario</caption>
              <thead className="border-b border-line text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
                <tr>
                  {['Usuario', 'Rol', 'Estado', 'Última conexión'].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((user) => {
                  const self = user.id === session?.id;
                  return (
                    <tr key={user.id} className="border-b border-line-soft last:border-b-0">
                      <td className="px-5 py-3">
                        <span className="block font-medium">
                          {user.fullName}
                          {self && <span className="text-ink-muted"> (tú)</span>}
                        </span>
                        <span className="block text-[13px] text-ink-muted">{user.email}</span>
                      </td>
                      <td className="px-5 py-3">
                        {self ? (
                          ROLE_LABEL[user.role]
                        ) : (
                          <select
                            aria-label={`Rol de ${user.fullName}`}
                            value={user.role}
                            disabled={role.isPending}
                            onChange={(e) =>
                              void role
                                .mutateAsync({ id: user.id, value: e.target.value as Role })
                                .then(
                                  () => toast('Rol cambiado'),
                                  () => undefined,
                                )
                            }
                            className="h-9 rounded-sm border border-line-strong bg-surface px-2 text-sm"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={user.status === 'active' ? 'success' : 'neutral'}>
                            {user.status === 'active' ? 'Activa' : 'Desactivada'}
                          </Badge>
                          {user.mustChangePassword && <Badge>Contraseña temporal</Badge>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">
                        {user.lastSeenAt ? madridDateTime(user.lastSeenAt) : 'Nunca'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={ROW_ACTION}
                            onClick={() => setPending({ type: 'reset', user })}
                            aria-label={`Restablecer la contraseña de ${user.fullName}`}
                          >
                            <KeyRound aria-hidden size={15} />
                            Contraseña
                          </button>
                          {!self && (
                            <button
                              type="button"
                              className={ROW_ACTION}
                              onClick={() => setPending({ type: 'toggle', user })}
                              aria-label={`${user.status === 'active' ? 'Desactivar' : 'Reactivar'} a ${user.fullName}`}
                            >
                              <Power aria-hidden size={15} />
                              {user.status === 'active' ? 'Desactivar' : 'Reactivar'}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <NewUserDialog
          onClose={() => setCreating(false)}
          onCreated={(user, password) => {
            setCreating(false);
            setTemporary({ user, password });
          }}
        />
      )}
      {pending && (
        <ConfirmDialog
          title={
            pending.type === 'reset'
              ? 'Restablecer contraseña'
              : pending.user.status === 'active'
                ? 'Desactivar cuenta'
                : 'Reactivar cuenta'
          }
          message={
            pending.type === 'reset'
              ? `${pending.user.fullName} recibirá una contraseña temporal que tendrá que cambiar al entrar. Se cerrarán sus sesiones abiertas.`
              : pending.user.status === 'active'
                ? `${pending.user.fullName} no podrá entrar y se cerrarán sus sesiones. Se puede reactivar cuando quieras.`
                : `${pending.user.fullName} podrá volver a entrar con su contraseña.`
          }
          confirmLabel={
            pending.type === 'reset'
              ? 'Restablecer'
              : pending.user.status === 'active'
                ? 'Desactivar'
                : 'Reactivar'
          }
          busy={reset.isPending || toggle.isPending}
          error={
            reset.isError
              ? apiErrorMessage(reset.error)
              : toggle.isError
                ? apiErrorMessage(toggle.error)
                : null
          }
          onCancel={() => {
            reset.reset();
            toggle.reset();
            setPending(null);
          }}
          onConfirm={confirm}
        />
      )}
      {temporary && (
        <TemporaryPasswordDialog
          user={temporary.user}
          password={temporary.password}
          onClose={() => setTemporary(null)}
        />
      )}
    </main>
  );
}
