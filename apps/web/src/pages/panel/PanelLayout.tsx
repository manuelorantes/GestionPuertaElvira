import { Outlet } from 'react-router';

import { useLogout } from '@/features/auth/useLogout';
import { useSession } from '@/features/auth/useSession';

import { PanelMobileHeader, PanelMobileNav } from './PanelMobileBars';
import { PanelSidebar } from './PanelSidebar';

export function PanelLayout() {
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  const handleLogout = () => logout.mutate();

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <PanelSidebar user={user} onLogout={handleLogout} />
      <PanelMobileHeader title="Resumen" onLogout={handleLogout} />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
      <PanelMobileNav />
    </div>
  );
}
