import type { ButtonHTMLAttributes } from 'react';

interface ToggleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  tone?: 'brand' | 'ink';
}

const PRESSED = {
  brand: 'border-brand bg-brand text-surface-raised',
  ink: 'border-ink-strong bg-ink-strong text-paper',
} as const;

/** Botón conmutable del diseño (días de la semana, aulas). */
export function ToggleButton({
  pressed,
  tone = 'brand',
  className = '',
  ...props
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`h-10 min-w-12 cursor-pointer rounded-sm border px-3 text-sm font-semibold ${
        pressed
          ? PRESSED[tone]
          : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-muted'
      } ${className}`}
      {...props}
    />
  );
}
