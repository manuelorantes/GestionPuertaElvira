import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  size?: 'narrow' | 'wide';
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

/**
 * Diálogo modal accesible: foco atrapado, Esc y clic fuera cierran, y el foco vuelve a quien lo abrió.
 */
export function Dialog({ open, onClose, labelledBy, children, size = 'narrow' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();

    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') trapFocus(event);
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink-strong/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`max-h-full w-full overflow-auto rounded-md bg-surface shadow-overlay ${size === 'wide' ? 'max-w-[560px]' : 'max-w-[400px]'}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
