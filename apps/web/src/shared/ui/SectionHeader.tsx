import type { ReactNode } from 'react';

import { Button } from './Button';

interface SectionAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  action?: SectionAction;
  /** Una segunda acción, menos destacada, debajo de la principal. */
  secondaryAction?: SectionAction;
}

export function SectionHeader({ eyebrow, title, action, secondaryAction }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-ink-muted">{eyebrow}</p>
        <h1 className="font-display text-[28px] font-bold tracking-[0.04em] text-ink-strong uppercase">
          {title}
        </h1>
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-col items-stretch gap-2">
          {action && (
            <Button onClick={action.onClick}>
              {action.icon}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="surface" onClick={secondaryAction.onClick}>
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
