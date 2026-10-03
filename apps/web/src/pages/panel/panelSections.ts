import {
  BookOpen,
  CalendarDays,
  Clock,
  GraduationCap,
  LayoutDashboard,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface PanelSection {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string | null;
}

/** Secciones del panel según el diseño. `path: null` = «Próximamente». */
export const PANEL_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel' },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos' },
  { id: 'clases', label: 'Clases', icon: CalendarDays, path: '/panel/clases' },
  { id: 'profesores', label: 'Profesores', icon: GraduationCap, path: '/panel/profesores' },
  { id: 'cobros', label: 'Cobros y cuotas', icon: Wallet, path: '/panel/cobros' },
  { id: 'contabilidad', label: 'Contabilidad', icon: BookOpen, path: null },
];

export const MOBILE_SECTIONS: PanelSection[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, path: '/panel' },
  { id: 'alumnos', label: 'Alumnos', icon: Users, path: '/panel/alumnos' },
  { id: 'cobro', label: 'Cobrar', icon: Wallet, path: '/panel/cobros' },
  { id: 'horas', label: 'Horas', icon: Clock, path: '/panel/profesores?pestana=horas' },
];
