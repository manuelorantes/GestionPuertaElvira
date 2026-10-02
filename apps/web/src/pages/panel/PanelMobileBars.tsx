import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router';

import { ClubLogo } from '@/shared/ui/ClubLogo';

import { MOBILE_SECTIONS } from './panelSections';

export function PanelMobileHeader({ title, onLogout }: { title: string; onLogout: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-line-soft bg-surface-raised px-4 py-3 md:hidden">
      <ClubLogo size={36} />
      <p className="flex-1 font-display text-[22px] font-bold tracking-[0.04em] uppercase">
        {title}
      </p>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Cerrar sesión"
        className="flex size-11 cursor-pointer items-center justify-center text-ink-soft"
      >
        <LogOut aria-hidden size={18} />
      </button>
    </header>
  );
}

export function PanelMobileNav() {
  return (
    <nav
      aria-label="Secciones móvil"
      className="grid grid-cols-4 border-t border-line-soft bg-surface-raised pb-2 md:hidden"
    >
      {MOBILE_SECTIONS.map(({ id, label, icon: Icon, path }) =>
        path ? (
          <NavLink
            key={id}
            to={path}
            end
            className="flex h-16 flex-col items-center justify-center gap-0.5 border-t-3 border-transparent text-xs font-medium text-ink-muted no-underline aria-[current=page]:border-brand aria-[current=page]:font-semibold aria-[current=page]:text-brand-strong"
          >
            <Icon aria-hidden size={22} className="shrink-0" />
            {label}
          </NavLink>
        ) : (
          <span
            key={id}
            aria-disabled="true"
            className="flex h-16 flex-col items-center justify-center gap-0.5 border-t-3 border-transparent text-xs font-medium text-ink-muted/50"
          >
            <Icon aria-hidden size={22} className="shrink-0" />
            {label}
          </span>
        ),
      )}
    </nav>
  );
}
