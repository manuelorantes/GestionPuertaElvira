import { ArrowLeftRight } from 'lucide-react';

import type { PanelView } from '@/features/auth/panelView';

/** Cambio entre el espacio de administración y el de profesor (administración vinculada a un profesor). */
export interface ViewSwitch {
  target: PanelView;
  onSwitch: () => void;
}

const VIEW_SWITCH_LABEL: Record<PanelView, string> = {
  teacher: 'Cambiar a profesor',
  staff: 'Cambiar a administración',
};

export function ViewSwitchButton({
  viewSwitch,
  compact = false,
}: {
  viewSwitch: ViewSwitch;
  compact?: boolean;
}) {
  const label = VIEW_SWITCH_LABEL[viewSwitch.target];
  return compact ? (
    <button
      type="button"
      onClick={viewSwitch.onSwitch}
      aria-label={label}
      title={label}
      className="flex size-11 cursor-pointer items-center justify-center text-ink-soft"
    >
      <ArrowLeftRight aria-hidden size={18} />
    </button>
  ) : (
    <button
      type="button"
      onClick={viewSwitch.onSwitch}
      className="flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted hover:text-ink-strong"
    >
      <ArrowLeftRight aria-hidden size={18} />
      {label}
    </button>
  );
}
