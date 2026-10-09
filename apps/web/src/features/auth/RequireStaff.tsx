import { Navigate, Outlet } from 'react-router';

import { usePanelRole } from './panelView';
import { useSession } from './useSession';

/**
 * Las secciones del club son para el personal: una cuenta de profesorado (o la administración en su espacio de
 * profesor) vuelve a sus clases.
 */
export function RequireStaff() {
  const { data: user } = useSession();
  if (usePanelRole(user) === 'teacher') return <Navigate to="/panel" replace />;
  return <Outlet />;
}
