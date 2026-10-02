import { useId, type InputHTMLAttributes, type Ref } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  help?: string;
  error?: string | undefined;
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  help,
  error,
  describedBy,
  id,
  className = '',
  ref,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = help ? `${inputId}-help` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const descriptions = [helpId, errorId, describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex w-full flex-col gap-1.5 text-left ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={descriptions}
        className="h-12 w-full min-w-0 rounded-sm border border-line-strong bg-surface px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 aria-invalid:border-danger-fg"
        {...props}
      />
      {help && (
        <p id={helpId} className="text-xs text-ink-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
