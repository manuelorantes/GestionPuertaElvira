import type { ComponentProps } from 'react';

export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-md border border-line bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}
