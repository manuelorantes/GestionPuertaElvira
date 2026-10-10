import { ChevronLeft, ChevronRight } from 'lucide-react';

const BUTTON =
  'flex size-10 cursor-pointer items-center justify-center rounded-sm border border-line-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

interface MonthNavProps {
  label: string;
  /** Sin él, no se puede ir a un mes anterior. */
  onPrevious?: (() => void) | undefined;
  /** Sin él, no se puede ir al mes siguiente. */
  onNext?: (() => void) | undefined;
}

/** «‹ Octubre 2026 ›»: navegación entre meses. */
export function MonthNav({ label, onPrevious, onNext }: MonthNavProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={onPrevious}
        disabled={!onPrevious}
        className={BUTTON}
      >
        <ChevronLeft aria-hidden size={18} />
      </button>
      <p
        aria-live="polite"
        className="min-w-40 text-center font-display text-xl font-semibold tracking-[0.04em] uppercase"
      >
        {label}
      </p>
      <button
        type="button"
        aria-label="Mes siguiente"
        onClick={onNext}
        disabled={!onNext}
        className={BUTTON}
      >
        <ChevronRight aria-hidden size={18} />
      </button>
    </div>
  );
}
