import {
  Activity,
  BookOpen,
  Star,
  CalendarDays,
  Clock,
  Contact,
  GraduationCap,
  History,
  LayoutDashboard,
  LayoutGrid,
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

/** Roles del personal del club (administración y el asistente); el profesorado tiene su propio menú. */
const STAFF_ROLES: Role[] = ['superadministrator', 'administrator', 'assistant'];

/** Secciones visibles para un rol. */
export function sectionsFor(sections: PanelSection[], role: Role): PanelSection[] {
  return sections.filter((section) => !section.roles || section.roles.includes(role));
}

/** Lo que ve una cuenta de profesorado: sus clases (para pasar lista), sus grupos, las clases y alumnos del club y sus pagos. */
const TEACHER_SECTIONS: PanelSection[] = [
  { id: 'mis-clases', label: 'Mis clases', icon: CalendarDays, path: '/panel', roles: ['teacher'] },
  {
    id: 'mis-grupos',
    label: 'Mis grupos',
    icon: Users,
    path: '/panel/mis-grupos',
    roles: ['teacher'],
  },
  // Las del club, de solo lectura: para informar de huecos y consultar a cualquier alumno.
  {
    id: 'clases-del-club',
    label: 'Clases',
    icon: LayoutGrid,
    path: '/panel/clases',
    roles: ['teacher'],
  },
  {
    id: 'alumnos-del-club',
    label: 'Alumnos',
    icon: Contact,
    path: '/panel/alumnos',
    roles: ['teacher'],
  },
  {
    id: 'mis-pagos',
    label: 'Mis pagos',
    icon: Wallet,
    path: '/panel/mis-pagos',
    roles: ['teacher'],
  },
];

/** Secciones del panel según el diseño. `path: null` = «Próximamente». */
export const PANEL_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel', roles: STAFF_ROLES },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos', roles: STAFF_ROLES },
  { id: 'clases', label: 'Clases', icon: CalendarDays, path: '/panel/clases', roles: STAFF_ROLES },
  {
    id: 'profesores',
    label: 'Profesores',
    icon: GraduationCap,
    path: '/panel/profesores',
    roles: STAFF_ROLES,
  },
  {
    id: 'cobros',
    label: 'Cobros y cuotas',
    icon: Wallet,
    path: '/panel/cobros',
    roles: STAFF_ROLES,
  },
  { id: 'puntos', label: 'Puntos', icon: Star, path: '/panel/puntos', roles: STAFF_ROLES },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    icon: BookOpen,
    path: '/panel/contabilidad',
    roles: STAFF_ROLES,
  },
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
  {
    id: 'sistema',
    label: 'Sistema',
    icon: Activity,
    path: '/panel/sistema',
    roles: ['superadministrator'],
  },
  ...TEACHER_SECTIONS,
];

export const MOBILE_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel', roles: STAFF_ROLES },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos', roles: STAFF_ROLES },
  { id: 'cobro', label: 'Cobrar', icon: Wallet, path: '/panel/cobros', roles: STAFF_ROLES },
  {
    id: 'horas',
    label: 'Horas',
    icon: Clock,
    path: '/panel/profesores?pestana=horas',
    roles: STAFF_ROLES,
  },
  ...TEACHER_SECTIONS,
];
