import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react';

import { useApiHealth, type ApiHealth } from './useApiHealth';

const STATUS: Record<ApiHealth, { label: string; className: string; Icon: typeof CircleCheck }> = {
  checking: {
    label: 'Comprobando la API…',
    className: 'bg-surface-muted text-ink-soft',
    Icon: LoaderCircle,
  },
  connected: {
    label: 'API conectada',
    className: 'bg-success-bg text-success-fg',
    Icon: CircleCheck,
  },
  unavailable: {
    label: 'API sin conexión',
    className: 'bg-danger-bg text-danger-fg',
    Icon: CircleX,
  },
};

export function ApiStatus() {
  const { label, className, Icon } = STATUS[useApiHealth()];

  return (
    <p
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${className}`}
    >
      <Icon aria-hidden size={16} />
      {label}
    </p>
  );
}
