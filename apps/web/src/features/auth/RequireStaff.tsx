import { Navigate, Outlet } from 'react-router';

import { useSession } from './useSession';

/** Las secciones del club son para el personal: una cuenta de profesorado vuelve a sus clases. */
export function RequireStaff() {
  const { data: user } = useSession();
  if (user?.role === 'teacher') return <Navigate to="/panel" replace />;
  return <Outlet />;
}
