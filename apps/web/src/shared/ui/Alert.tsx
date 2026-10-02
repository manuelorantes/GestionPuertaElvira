import type { ReactNode } from 'react';

const TONES = {
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-surface-muted text-ink-soft',
} as const;

interface AlertProps {
  tone?: keyof typeof TONES;
  children: ReactNode;
}

export function Alert({ tone = 'danger', children }: AlertProps) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`w-full rounded-sm px-3 py-2 text-left text-sm font-medium ${TONES[tone]}`}
    >
      {children}
    </p>
  );
}
