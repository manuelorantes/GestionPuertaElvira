import { useSyncExternalStore } from 'react';

import type { Role, SessionUser } from './api';

/**
 * Espacio en el que se usa el panel. La administración vinculada a un profesor cambia entre el suyo (`staff`) y el de
 * ese profesor (`teacher`), que funciona como el de cualquier cuenta de profesorado. Dura lo que la pestaña y al
 * entrar, salir o cambiar de cuenta vuelve a administración.
 */
export type PanelView = 'staff' | 'teacher';

const STORAGE_KEY = 'panel-view';
const listeners = new Set<() => void>();

function readView(): PanelView {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'teacher' ? 'teacher' : 'staff';
  } catch {
    return 'staff';
  }
}

function writeView(view: PanelView): void {
  try {
    if (view === 'teacher') sessionStorage.setItem(STORAGE_KEY, view);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento (navegación privada estricta) el cambio no sobrevive a recargar: no pasa nada.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** Vuelve al espacio de administración (al entrar, salir o cambiar de cuenta). */
export function resetPanelView(): void {
  writeView('staff');
}

/** Solo la administración vinculada a un profesor tiene los dos espacios. */
function canSwitchToTeacher(user: SessionUser): boolean {
  return user.role !== 'teacher' && user.teacherId !== null;
}

/** El espacio en uso y cómo cambiar al otro. */
export function usePanelView(user: SessionUser | null | undefined) {
  const stored = useSyncExternalStore(subscribe, readView, () => 'staff' as const);
  const canSwitch = user ? canSwitchToTeacher(user) : false;
  const view: PanelView = canSwitch ? stored : 'staff';
  return { view, canSwitch, switchTo: writeView };
}

/** El rol con el que se ve el panel: profesorado en el espacio de profesor. */
export function usePanelRole(user: SessionUser | null | undefined): Role | undefined {
  const { view } = usePanelView(user);
  return view === 'teacher' ? 'teacher' : user?.role;
}
