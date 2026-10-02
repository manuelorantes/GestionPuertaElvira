import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-surface-raised hover:bg-brand-strong',
  secondary: 'border border-line-strong bg-transparent text-ink hover:bg-surface-muted',
  outline: 'border border-ink-strong bg-transparent text-ink-strong hover:bg-sand',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-muted',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  busy?: boolean;
  busyLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  busy = false,
  busyLabel,
  disabled,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
