import { Outlet, useLocation, useNavigate } from 'react-router';

import { ROLE_LABEL } from '@/features/auth/api';
import { type PanelView, usePanelView } from '@/features/auth/panelView';
import { useStopImpersonation } from '@/features/auth/useImpersonation';
import { useLogout } from '@/features/auth/useLogout';
import { useSession } from '@/features/auth/useSession';

import { FetchingBar } from './FetchingBar';
import { PanelMobileHeader, PanelMobileNav } from './PanelMobileBars';
import { PanelSidebar } from './PanelSidebar';
import { PANEL_SECTIONS, sectionsFor } from './panelSections';
import type { ViewSwitch } from './ViewSwitchButton';

export function PanelLayout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const stop = useStopImpersonation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { view, canSwitch, switchTo } = usePanelView(user);
  if (!user) return null;

  const role = view === 'teacher' ? 'teacher' : user.role;
  const sections = sectionsFor(PANEL_SECTIONS, role);
  const title =
    sections
      .filter((section) => section.path && section.path !== '/panel')
      .find((section) => pathname.startsWith(section.path ?? ''))?.label ??
    sections.find((section) => section.path === '/panel')?.label ??
    'Resumen';

  const handleLogout = () => logout.mutate();
  const otherView: PanelView = view === 'teacher' ? 'staff' : 'teacher';
  const viewSwitch: ViewSwitch | null = canSwitch
    ? {
        target: otherView,
        onSwitch: () => {
          switchTo(otherView);
          void navigate('/panel');
        },
      }
    : null;

  return (
    <div className="flex h-screen flex-col">
      <FetchingBar />
      {user.impersonatedBy && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-ink-strong px-4 py-2.5 text-sm text-paper md:px-6"
        >
          <p>
            Estás usando la aplicación como <strong>{user.fullName}</strong> (
            {ROLE_LABEL[user.role].toLowerCase()}). Lo que hagas queda en el historial a su nombre y
            al tuyo.
          </p>
          <button
            type="button"
            disabled={stop.isPending}
            onClick={() => stop.mutate()}
            className="h-9 cursor-pointer rounded-sm border border-paper/40 px-3 font-semibold hover:bg-paper/10 disabled:opacity-60"
          >
            {stop.isPending ? 'Volviendo…' : 'Volver a mi cuenta'}
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <PanelSidebar user={user} role={role} viewSwitch={viewSwitch} onLogout={handleLogout} />
        <PanelMobileHeader title={title} viewSwitch={viewSwitch} onLogout={handleLogout} />
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Outlet />
        </div>
        <PanelMobileNav role={role} />
      </div>
    </div>
  );
}
