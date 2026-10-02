import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router';

import { ROLE_LABEL, type SessionUser } from '@/features/auth/api';
import { ClubLogo } from '@/shared/ui/ClubLogo';

import { PANEL_SECTIONS } from './panelSections';

interface PanelSidebarProps {
  user: SessionUser;
  onLogout: () => void;
}

export function PanelSidebar({ user, onLogout }: PanelSidebarProps) {
  return (
    <aside className="hidden w-62 shrink-0 flex-col border-r border-line-soft bg-surface-raised px-4 py-6 md:flex">
      <div className="flex items-center gap-3 px-2 pb-6">
        <ClubLogo size={44} />
        <p className="font-display text-lg leading-[1.05] font-bold tracking-[0.06em] text-ink-strong uppercase">
          Puerta Elvira
          <br />
          <span className="font-medium tracking-[0.04em] text-ink-muted">Gestión</span>
        </p>
      </div>
      <nav aria-label="Secciones" className="flex flex-col gap-1">
        {PANEL_SECTIONS.map(({ id, label, icon: Icon, path }) =>
          path ? (
            <NavLink
              key={id}
              to={path}
              end
              className="flex h-11 items-center gap-3 rounded-sm px-3 text-[15px] font-medium text-ink-soft no-underline hover:bg-surface-muted aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand-strong"
            >
              <Icon aria-hidden size={18} className="shrink-0" />
              {label}
            </NavLink>
          ) : (
            <span
              key={id}
              aria-disabled="true"
              className="flex h-11 items-center gap-3 rounded-sm px-3 text-[15px] font-medium whitespace-nowrap text-ink-soft/60"
            >
              <Icon aria-hidden size={18} className="shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{label}</span>
                <span className="text-[10px] font-semibold tracking-wide uppercase">
                  Próximamente
                </span>
              </span>
            </span>
          ),
        )}
      </nav>
      <div className="flex-1" />
      <div className="flex flex-col gap-3 border-t border-line-soft px-2 pt-4">
        <div className="text-sm">
          <p className="font-semibold text-ink-strong">{user.fullName}</p>
          <p className="text-xs text-ink-muted">{ROLE_LABEL[user.role]}</p>
        </div>
        <p className="text-xs text-ink-muted">
          Temporada <strong className="text-ink-strong">2026/27</strong>
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 cursor-pointer items-center gap-2 text-sm text-ink-soft hover:text-ink-strong"
        >
          <LogOut aria-hidden size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
