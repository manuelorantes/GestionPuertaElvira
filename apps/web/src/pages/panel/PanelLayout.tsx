import { Outlet, useLocation } from 'react-router';

import { useLogout } from '@/features/auth/useLogout';
import { useSession } from '@/features/auth/useSession';

import { PanelMobileHeader, PanelMobileNav } from './PanelMobileBars';
import { PanelSidebar } from './PanelSidebar';
import { PANEL_SECTIONS } from './panelSections';

export function PanelLayout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const { pathname } = useLocation();
  const title =
    PANEL_SECTIONS.filter((section) => section.path && section.path !== '/panel').find((section) =>
      pathname.startsWith(section.path ?? ''),
    )?.label ?? 'Resumen';

  if (!user) return null;

  const handleLogout = () => logout.mutate();

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <PanelSidebar user={user} onLogout={handleLogout} />
      <PanelMobileHeader title={title} onLogout={handleLogout} />
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <Outlet />
      </div>
      <PanelMobileNav />
    </div>
  );
}
