import { Navigate, Outlet, useLocation } from 'react-router';

import { useSession } from './useSession';

export const CHANGE_PASSWORD_PATH = '/panel/cambiar-contrasena';

/**
 * Protege el panel: sin sesión, a la portada con el acceso abierto; con contraseña temporal,
 * solo la pantalla de cambio de contraseña.
 */
export function RequireSession() {
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <p role="status" className="flex min-h-screen items-center justify-center text-ink-muted">
        Comprobando la sesión…
      </p>
    );
  }

  if (!user) {
    return <Navigate to="/?acceso=1" replace state={{ from: location.pathname }} />;
  }

  const mustChangePassword = user.mustChangePassword;
  const isOnChangePassword = location.pathname === CHANGE_PASSWORD_PATH;

  if (mustChangePassword && !isOnChangePassword)
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  if (!mustChangePassword && isOnChangePassword) return <Navigate to="/panel" replace />;

  return <Outlet />;
}
