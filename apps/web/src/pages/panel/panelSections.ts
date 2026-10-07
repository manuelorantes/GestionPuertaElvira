import {
  BookOpen,
  CalendarDays,
  Clock,
  GraduationCap,
  History,
  LayoutDashboard,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { Role } from '@/features/auth/api';

export interface PanelSection {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string | null;
  /** Roles que la ven; sin lista, la ven todos. */
  roles?: Role[];
}

/** Secciones visibles para un rol. */
export function sectionsFor(sections: PanelSection[], role: Role): PanelSection[] {
  return sections.filter((section) => !section.roles || section.roles.includes(role));
}

/** Secciones del panel según el diseño. `path: null` = «Próximamente». */
export const PANEL_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel' },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos' },
  { id: 'clases', label: 'Clases', icon: CalendarDays, path: '/panel/clases' },
  { id: 'profesores', label: 'Profesores', icon: GraduationCap, path: '/panel/profesores' },
  { id: 'cobros', label: 'Cobros y cuotas', icon: Wallet, path: '/panel/cobros' },
  { id: 'contabilidad', label: 'Contabilidad', icon: BookOpen, path: '/panel/contabilidad' },
  {
    id: 'historial',
    label: 'Historial',
    icon: History,
    path: '/panel/historial',
    roles: ['superadministrator'],
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    icon: UserCog,
    path: '/panel/usuarios',
    roles: ['superadministrator'],
  },
];

export const MOBILE_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel' },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos' },
  { id: 'cobro', label: 'Cobrar', icon: Wallet, path: '/panel/cobros' },
  { id: 'horas', label: 'Horas', icon: Clock, path: '/panel/profesores?pestana=horas' },
];
