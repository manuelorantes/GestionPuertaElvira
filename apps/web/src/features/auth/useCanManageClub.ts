import { usePanelRole } from './panelView';
import { useSession } from './useSession';

/**
 * Si quien usa el panel gestiona el club (administración) o solo lo consulta (profesorado, o administración en su
 * espacio de profesor): las secciones de Clases y Alumnos son de solo lectura para el profesorado.
 */
export function useCanManageClub(): boolean {
  const { data: user } = useSession();
  const role = usePanelRole(user);
  return role !== undefined && role !== 'teacher';
}
