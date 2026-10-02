import type { ReactNode } from 'react';

import { Button } from './Button';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  action?: { label: string; icon?: ReactNode; onClick: () => void };
}

export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-ink-muted">{eyebrow}</p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          {title}
        </h1>
      </div>
      {action && (
        <Button onClick={action.onClick}>
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
}
