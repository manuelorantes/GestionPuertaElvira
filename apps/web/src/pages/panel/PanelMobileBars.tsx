import { LogOut } from 'lucide-react';
import { NavLink, useLocation, type Location } from 'react-router';

import type { Role } from '@/features/auth/api';
import { ClubLogo } from '@/shared/ui/ClubLogo';

import { MOBILE_SECTIONS, sectionsFor } from './panelSections';

/**
 * Un acceso con parámetros (p. ej. «Horas» → Profesores, pestaña de horas) solo se marca si la URL los tiene:
 * NavLink compara solo la ruta.
 */
function isMobileItemActive(path: string, location: Location): boolean {
  const [pathname = '', search = ''] = path.split('?');
  const onPath =
    pathname === '/panel' ? location.pathname === '/panel' : location.pathname.startsWith(pathname);
  const current = new URLSearchParams(location.search);
  return (
    onPath && [...new URLSearchParams(search)].every(([key, value]) => current.get(key) === value)
  );
}

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

const COLUMNS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4' };

export function PanelMobileNav({ role }: { role: Role }) {
  const location = useLocation();
  const sections = sectionsFor(MOBILE_SECTIONS, role);
  return (
    <nav
      aria-label="Secciones móvil"
      className={`grid ${COLUMNS[sections.length] ?? 'grid-cols-4'} border-t border-line-soft bg-surface-raised pb-2 md:hidden`}
    >
      {sections.map(({ id, label, icon: Icon, path }) =>
        path ? (
          <NavLink
            key={id}
            to={path}
            end={path === '/panel'}
            aria-current={isMobileItemActive(path, location) ? 'page' : 'false'}
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
